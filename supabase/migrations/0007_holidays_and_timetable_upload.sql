-- 1. Holidays: on a holiday the regular timetable does not apply (rooms show as free), while
--    one-off bookings, CIEs and events still do. Holidays are added for tomorrow or later, and
--    only future ones can be removed, so past days never change.
-- 2. Bulk timetable upload: replace the regular timetable of the rooms in an uploaded
--    document, from tomorrow on (a new timetable version, like a single edit).

create table public.holidays (
  date       date primary key,
  name       text not null check (length(btrim(name)) > 0),
  created_by text not null,
  created_at timestamptz not null default now()
);
alter table public.holidays enable row level security;
create policy "anyone reads holidays" on public.holidays for select using (true);
grant select on public.holidays to anon, authenticated;

create or replace function public.holidays_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Holidays cannot be edited; remove it and add it again' using errcode = 'P0001';
  end if;
  if old.date <= public.ist_today() then
    raise exception 'Past holidays cannot be removed' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger holidays_guard before update or delete on public.holidays
  for each row execute function public.holidays_guard();

create or replace function public.admin_add_holiday(p_date date, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare me public.people := public.require_admin();
begin
  if p_date <= public.ist_today() then
    raise exception 'A holiday can be added for tomorrow or later' using errcode = 'P0001';
  end if;
  insert into public.holidays (date, name, created_by) values (p_date, btrim(p_name), me.email)
  on conflict (date) do nothing;
  if not found then
    raise exception 'That day is already a holiday' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.admin_remove_holiday(p_date date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  delete from public.holidays where date = p_date;
end $$;

revoke execute on function public.admin_add_holiday(date, text) from public, anon;
grant execute on function public.admin_add_holiday(date, text) to authenticated;
revoke execute on function public.admin_remove_holiday(date) from public, anon;
grant execute on function public.admin_remove_holiday(date) to authenticated;

-- The day schedule, now leaving out the regular timetable on holidays.
create or replace function public.get_day_schedule(p_date date)
returns table (
  room_id       text,
  room_name     text,
  slot_id       smallint,
  slot_label    text,
  starts        time,
  ends          time,
  status        text,      -- free | class | department | booked | cie | event
  subject       text,
  faculty_name  text,
  reason        text,
  is_mine       boolean,   -- the signed-in faculty teaches / booked it
  ended         boolean
)
language sql stable security definer set search_path = public as $$
  with
  me as (select initials, email from public.people where email = public.current_email() and active),
  ver as (
    select v.id from public.timetable_versions v
    where p_date between v.valid_from and v.valid_to
    order by v.valid_from desc, v.id desc limit 1
  ),
  latest as (
    select distinct on (a.room_id, a.slot_id) a.*
    from public.allotments a
    where a.date = p_date
    order by a.room_id, a.slot_id, a.id desc
  )
  select
    r.id, r.name, s.id, s.label, s.starts, s.ends,
    case
      when l.kind in ('class_request', 'event_request') then 'booked'
      when l.kind = 'cie'   then 'cie'
      when l.kind = 'event' then 'event'
      when l.kind = 'drop'  then 'free'
      when t.id is null     then 'free'
      when t.is_department  then 'department'
      else 'class'
    end,
    case
      when l.kind in ('class_request', 'event_request', 'cie', 'event') then l.title
      when l.kind = 'drop' then null
      else t.subject
    end,
    case
      when l.kind in ('class_request', 'event_request', 'cie', 'event') then l.faculty_name
      when l.kind = 'drop' then null
      when t.id is not null then public.faculty_display(t.faculty_initials, t.faculty_label)
    end,
    case
      when l.kind in ('class_request', 'event_request', 'cie', 'event') then l.reason
      when l.kind = 'drop' then 'Class dropped: ' || l.reason
    end,
    case
      when l.kind in ('class_request', 'event_request') then l.faculty_email = (select email from me)
      when l.kind is null or l.kind = 'restore' then
        coalesce((select initials from me) = any (t.faculty_initials), false)
      else false
    end,
    public.slot_has_ended(p_date, s.id)
  from public.rooms r
  cross join public.slots s
  left join public.timetable_entries t
    on t.version_id = (select id from ver)
   and t.room_id = r.id and t.slot_id = s.id
   and t.weekday = extract(isodow from p_date)
   and not exists (select 1 from public.holidays h where h.date = p_date)
  left join latest l on l.room_id = r.id and l.slot_id = s.id
  where extract(isodow from p_date) between 1 and 6
  order by s.starts, r.sort_order, r.id
$$;

-- Every cell of the regular timetable that applies on a date, for all weekdays.
create or replace function public.get_timetable_all(p_date date)
returns table (room_id text, weekday int, slot_id int, subject text, faculty_initials text[], faculty_label text, is_department boolean)
language sql stable security definer set search_path = public as $$
  select t.room_id, t.weekday, t.slot_id, t.subject, t.faculty_initials, t.faculty_label, t.is_department
  from public.timetable_entries t
  where t.version_id = (select v.id from public.timetable_versions v
                         where p_date between v.valid_from and v.valid_to
                         order by v.valid_from desc, v.id desc limit 1)
$$;
grant execute on function public.get_timetable_all(date) to authenticated;

-- Replace the timetable of the listed rooms with p_entries, from tomorrow on. Rooms not in
-- the list keep their timetable. Every changed cell is written to timetable_changes.
create or replace function public.admin_replace_timetable(p_rooms text[], p_entries jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_from date := public.ist_today() + 1;
  v_src public.timetable_versions;
  v_new int;
  v_changed int;
begin
  if coalesce(array_length(p_rooms, 1), 0) = 0 then
    raise exception 'The document has no rooms' using errcode = 'P0001';
  end if;
  select * into v_src from public.timetable_versions v
   where v_from between v.valid_from and v.valid_to
   order by v.valid_from desc, v.id desc limit 1;
  if v_src.id is null then
    raise exception 'There is no timetable for tomorrow to change' using errcode = 'P0001';
  end if;

  create temp table incoming on commit drop as
  select e.room_id, e.weekday::smallint as weekday, e.slot_id::smallint as slot_id, btrim(e.subject) as subject,
         coalesce(e.faculty_initials, '{}') as faculty_initials, coalesce(e.faculty_label, '') as faculty_label,
         coalesce(e.is_department, false) as is_department
    from jsonb_to_recordset(p_entries) as e(room_id text, weekday int, slot_id int, subject text,
                                             faculty_initials text[], faculty_label text, is_department boolean)
   where e.room_id = any (p_rooms) and btrim(coalesce(e.subject, '')) <> '';

  -- Cells that differ between the current timetable and the upload
  create temp table diff on commit drop as
  select coalesce(o.room_id, n.room_id) as room_id, coalesce(o.weekday, n.weekday) as weekday,
         coalesce(o.slot_id, n.slot_id) as slot_id,
         coalesce(o.subject || coalesce(' (' || nullif(o.faculty_label, '') || ')', ''), 'Free') as old_value,
         coalesce(n.subject || coalesce(' (' || nullif(n.faculty_label, '') || ')', ''), 'Free') as new_value
    from (select * from public.timetable_entries where version_id = v_src.id and room_id = any (p_rooms)) o
    full join incoming n on n.room_id = o.room_id and n.weekday = o.weekday and n.slot_id = o.slot_id
   where o.subject is distinct from n.subject or o.faculty_initials is distinct from n.faculty_initials
      or o.is_department is distinct from n.is_department;
  select count(*) into v_changed from diff;
  if v_changed = 0 then
    raise exception 'The uploaded timetable is the same as the current one; nothing to change' using errcode = 'P0001';
  end if;

  insert into public.timetable_versions (name, valid_from, valid_to)
  values ('Uploaded by ' || me.email || ' on ' || to_char(public.ist_today(), 'DD/MM/YYYY'), v_from, v_src.valid_to)
  returning id into v_new;

  insert into public.timetable_entries (version_id, room_id, weekday, slot_id, subject, faculty_initials, faculty_label, is_department)
  select v_new, t.room_id, t.weekday, t.slot_id, t.subject, t.faculty_initials, t.faculty_label, t.is_department
    from public.timetable_entries t
   where t.version_id = v_src.id and not (t.room_id = any (p_rooms));
  insert into public.timetable_entries (version_id, room_id, weekday, slot_id, subject, faculty_initials, faculty_label, is_department)
  select distinct on (room_id, weekday, slot_id) v_new, room_id, weekday, slot_id, subject, faculty_initials, faculty_label, is_department
    from incoming;

  insert into public.timetable_changes (version_id, room_id, weekday, slot_ids, old_value, new_value, effective_from, changed_by)
  select v_new, room_id, weekday, array[slot_id], old_value, new_value, v_from, me.email from diff
   order by room_id, weekday, slot_id;
  return v_changed;
end $$;

revoke execute on function public.admin_replace_timetable(text[], jsonb) from public, anon;
grant execute on function public.admin_replace_timetable(text[], jsonb) to authenticated;

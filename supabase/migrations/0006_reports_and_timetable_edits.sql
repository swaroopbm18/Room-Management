-- 1. Report of changes to the timetable over a date range (events, dropped classes, extra classes).
-- 2. Admins can change the regular timetable. A change takes effect from the next day: it is
--    saved as a new timetable version starting tomorrow, so every earlier day keeps the old
--    subject and faculty.

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------

-- What each slot ended up as, for every slot in the range that differs from the timetable.
-- Restored slots are left out, since they went back to the regular class.
create or replace function public.get_change_report(p_from date, p_to date)
returns table (
  date date, slot_id int, starts time, ends time, room_id text,
  kind public.allotment_kind, title text, faculty_name text, reason text, subject text
)
language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (a.date, a.room_id, a.slot_id) a.*
    from public.allotments a
    where a.date between p_from and p_to
    order by a.date, a.room_id, a.slot_id, a.id desc
  )
  select l.date, l.slot_id, s.starts, s.ends, l.room_id, l.kind, l.title, l.faculty_name, l.reason,
         (select t.subject from public.timetable_entries t
           where t.version_id = (select v.id from public.timetable_versions v
                                  where l.date between v.valid_from and v.valid_to
                                  order by v.valid_from desc, v.id desc limit 1)
             and t.room_id = l.room_id and t.slot_id = l.slot_id
             and t.weekday = extract(isodow from l.date))
  from latest l
  join public.slots s on s.id = l.slot_id
  where l.kind <> 'restore' and public.is_admin()
  order by l.date, s.starts, l.room_id
$$;

revoke execute on function public.get_change_report(date, date) from public, anon;
grant execute on function public.get_change_report(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Timetable edits
-- ---------------------------------------------------------------------------

-- A permanent log of who changed which timetable cell and when.
create table public.timetable_changes (
  id            bigserial primary key,
  version_id    int not null references public.timetable_versions(id),
  room_id       text not null references public.rooms(id),
  weekday       smallint not null check (weekday between 1 and 6),
  slot_ids      smallint[] not null,
  old_value     text not null default '',
  new_value     text not null default '',
  effective_from date not null,
  changed_by    text not null,
  created_at    timestamptz not null default now()
);
create trigger timetable_changes_no_update before update or delete on public.timetable_changes
  for each row execute function public.forbid_change();
alter table public.timetable_changes enable row level security;
create policy "staff read timetable changes" on public.timetable_changes for select using (public.is_staff());
grant select on public.timetable_changes to authenticated;

-- The regular timetable (no one-off changes) that applies on a date.
create or replace function public.get_timetable(p_date date)
returns table (room_id text, slot_id int, subject text, faculty_initials text[], faculty_name text, is_department boolean)
language sql stable security definer set search_path = public as $$
  select t.room_id, t.slot_id, t.subject, t.faculty_initials,
         public.faculty_display(t.faculty_initials, t.faculty_label), t.is_department
  from public.timetable_entries t
  where t.version_id = (select v.id from public.timetable_versions v
                         where p_date between v.valid_from and v.valid_to
                         order by v.valid_from desc, v.id desc limit 1)
    and t.weekday = extract(isodow from p_date)
$$;
grant execute on function public.get_timetable(date) to anon, authenticated;

-- Change one or more consecutive slots of one room on one weekday, from tomorrow on.
-- An empty subject makes the slots free.
create or replace function public.admin_edit_timetable(
  p_room text, p_weekday int, p_slots int[], p_subject text, p_initials text[], p_is_department boolean default false
) returns date language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_from date := public.ist_today() + 1;
  v_src public.timetable_versions;
  v_new int;
  v_subject text := nullif(btrim(coalesce(p_subject, '')), '');
  v_initials text[] := coalesce((select array_agg(upper(btrim(x))) from unnest(p_initials) x where btrim(x) <> ''), '{}');
  v_old text;
begin
  if p_weekday not between 1 and 6 then
    raise exception 'Pick a day from Monday to Saturday' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_slots, 1), 0) = 0 then
    raise exception 'Pick at least one slot' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.rooms where id = p_room) then
    raise exception 'Unknown room' using errcode = 'P0001';
  end if;

  select * into v_src from public.timetable_versions v
   where v_from between v.valid_from and v.valid_to
   order by v.valid_from desc, v.id desc limit 1;
  if v_src.id is null then
    raise exception 'There is no timetable for tomorrow to change' using errcode = 'P0001';
  end if;

  select coalesce(string_agg(t.subject || coalesce(' (' || nullif(t.faculty_label, '') || ')', ''), ', ' order by t.slot_id), 'Free')
    into v_old
    from public.timetable_entries t
   where t.version_id = v_src.id and t.room_id = p_room and t.weekday = p_weekday and t.slot_id = any (p_slots);

  insert into public.timetable_versions (name, valid_from, valid_to)
  values ('Edited by ' || me.email || ' on ' || to_char(public.ist_today(), 'DD/MM/YYYY'), v_from, v_src.valid_to)
  returning id into v_new;

  -- Copy the whole timetable, minus the cells being changed, then add the new cells.
  insert into public.timetable_entries (version_id, room_id, weekday, slot_id, subject, faculty_initials, faculty_label, is_department)
  select v_new, t.room_id, t.weekday, t.slot_id, t.subject, t.faculty_initials, t.faculty_label, t.is_department
    from public.timetable_entries t
   where t.version_id = v_src.id
     and not (t.room_id = p_room and t.weekday = p_weekday and t.slot_id = any (p_slots));

  if v_subject is not null then
    insert into public.timetable_entries (version_id, room_id, weekday, slot_id, subject, faculty_initials, faculty_label, is_department)
    select v_new, p_room, p_weekday, s, v_subject, v_initials, array_to_string(v_initials, ', '), coalesce(p_is_department, false)
      from unnest(p_slots) s;
  end if;

  insert into public.timetable_changes (version_id, room_id, weekday, slot_ids, old_value, new_value, effective_from, changed_by)
  values (v_new, p_room, p_weekday, p_slots::smallint[], v_old,
          coalesce(v_subject || coalesce(' (' || nullif(array_to_string(v_initials, ', '), '') || ')', ''), 'Free'),
          v_from, me.email);
  return v_from;
end $$;

revoke execute on function public.admin_edit_timetable(text, int, int[], text, text[], boolean) from public, anon;
grant execute on function public.admin_edit_timetable(text, int, int[], text, text[], boolean) to authenticated;

-- 1. Free and busy faculty for any date, readable by everyone (home page and /faculty-status).
--    A faculty member is busy in a slot when they teach it that day (the regular timetable,
--    unless the slot was dropped, booked or taken for a CIE/event), when an approved request
--    of theirs is in that slot, or when an admin added a weekly duty for it. Duty details stay
--    private: the public only sees "Other duty".
-- 2. Admins can name faculty who show only as initials, change their title or name, and give
--    or change their timetable initials. Changing initials carries their duties, cluster and
--    sign-in account over to the new initials.
-- 3. The faculty in faculty-list.csv that were missing from the directory are added, without a
--    name, so they show up for admins to name.
-- Depends on 0013 (faculty_duties) and 0014 (faculty_clusters).

-- A directory entry with no name yet shows its initials.
alter table public.faculty_directory alter column full_name set default '';

insert into public.faculty_directory (initials, title, full_name) values
  ('LKB', 'Prof.', ''),
  ('MHM', 'Prof.', ''),
  ('PP', 'Prof.', ''),
  ('PPM', 'Prof.', ''),
  ('RS', 'Prof.', '')
on conflict (initials) do nothing;

create or replace function public.faculty_display(p_initials text[], p_label text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when coalesce(array_length(p_initials, 1), 0) = 0 then nullif(p_label, '')
    else (
      select string_agg(
               coalesce(public.display_name(p),
                        case when btrim(d.full_name) <> '' then btrim(d.title || ' ' || d.full_name) end,
                        nullif(split_part(p_label, ', ', i.ord::int), ''),
                        i.ini),
               ', ' order by i.ord)
      from unnest(p_initials) with ordinality as i(ini, ord)
      left join public.people p on p.initials = i.ini and p.active
      left join public.faculty_directory d on d.initials = i.ini
    )
  end
$$;

create or replace function public.faculty_status(p_date date)
returns table (
  initials text,
  name     text,
  cluster  text,      -- 'A', 'B' or null
  slot_id  smallint,
  busy     boolean,
  activity text,      -- what they are doing, when busy
  room_id  text
)
language sql stable security definer set search_path = public as $$
  with
  ver as (
    select v.id from public.timetable_versions v
    where p_date between v.valid_from and v.valid_to
    order by v.valid_from desc, v.id desc limit 1
  ),
  open_day as (
    select extract(isodow from p_date) between 1 and 6
           and not exists (select 1 from public.holidays h where h.date = p_date) as ok
  ),
  latest as (
    select distinct on (a.room_id, a.slot_id) a.*
    from public.allotments a
    where a.date = p_date
    order by a.room_id, a.slot_id, a.id desc
  ),
  -- Classes that still take place that day
  classes as (
    select ini, t.slot_id::smallint as slot_id, t.subject as activity, t.room_id
    from public.timetable_entries t
    cross join lateral unnest(t.faculty_initials) as ini
    left join latest l on l.room_id = t.room_id and l.slot_id = t.slot_id
    where t.version_id = (select id from ver)
      and t.weekday = extract(isodow from p_date)
      and not t.is_department
      and (l.kind is null or l.kind = 'restore')
  ),
  booked as (
    select p.initials as ini, l.slot_id, l.title as activity, l.room_id
    from latest l join public.people p on p.email = l.faculty_email
    where l.kind in ('class_request', 'event_request') and p.initials is not null
  ),
  duties as (
    select d.initials as ini, d.slot_id, 'Other duty'::text as activity, null::text as room_id
    from public.faculty_duties d
    where d.weekday = extract(isodow from p_date)
  ),
  busy as (
    select * from classes union all select * from booked union all select * from duties
  ),
  faculty as (
    select initials from public.faculty_directory
    union select initials from public.people where initials is not null and active
    union select unnest(t.faculty_initials) from public.timetable_entries t
           where t.version_id = (select id from ver) and not t.is_department
  )
  select f.initials,
         coalesce(public.display_name(p),
                  case when btrim(d.full_name) <> '' then btrim(d.title || ' ' || d.full_name) end,
                  f.initials),
         c.cluster,
         s.id,
         b.activity is not null,
         b.activity,
         b.room_id
  from faculty f
  cross join public.slots s
  left join public.people p on p.initials = f.initials and p.active
  left join public.faculty_directory d on d.initials = f.initials
  left join public.faculty_clusters c on c.initials = f.initials
  left join lateral (
    select string_agg(distinct x.activity, ' / ') as activity, string_agg(distinct x.room_id, ', ') as room_id
    from busy x where x.ini = f.initials and x.slot_id = s.id
  ) b on true
  where (select ok from open_day)
  order by s.starts, f.initials
$$;
grant execute on function public.faculty_status(date) to anon, authenticated;

-- Add or edit a faculty member in the directory. p_old_initials is null to add one.
create or replace function public.admin_save_faculty(p_old_initials text, p_initials text, p_title text, p_full_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_old text := nullif(upper(btrim(coalesce(p_old_initials, ''))), '');
  v_new text := upper(btrim(coalesce(p_initials, '')));
  v_title text := btrim(coalesce(p_title, ''));
  v_name text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
begin
  if v_new !~ '^[A-Z][A-Z.]{0,9}$' then
    raise exception 'Initials must be 1 to 10 letters, e.g. AKN' using errcode = 'P0001';
  end if;
  if v_title not in ('', 'Dr.', 'Prof.', 'Mr.', 'Ms.', 'Mrs.') then
    raise exception 'Pick Dr., Prof., Mr., Ms. or Mrs. as the title' using errcode = 'P0001';
  end if;
  if length(v_name) > 80 then
    raise exception 'Keep the name under 80 characters' using errcode = 'P0001';
  end if;
  if v_new is distinct from v_old and exists (select 1 from public.faculty_directory where initials = v_new) then
    raise exception 'Initials % are already used by another faculty member', v_new using errcode = 'P0001';
  end if;

  if v_old is null then
    insert into public.faculty_directory (initials, title, full_name) values (v_new, v_title, v_name);
    return;
  end if;

  if v_new <> v_old then
    if exists (select 1 from public.people where initials = v_new) then
      raise exception 'Initials % already belong to a signed-in faculty member', v_new using errcode = 'P0001';
    end if;
    update public.people set initials = v_new where initials = v_old;
    update public.faculty_duties set initials = v_new where initials = v_old;
    update public.faculty_clusters set initials = v_new where initials = v_old;
  end if;
  insert into public.faculty_directory (initials, title, full_name) values (v_new, v_title, v_name)
  on conflict (initials) do update set title = excluded.title, full_name = excluded.full_name;
  if v_new <> v_old then
    delete from public.faculty_directory where initials = v_old;
  end if;
end $$;

create or replace function public.admin_remove_faculty(p_initials text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.people := public.require_admin();
begin
  delete from public.faculty_directory where initials = upper(btrim(coalesce(p_initials, '')));
end $$;

revoke execute on function public.admin_save_faculty(text, text, text, text), public.admin_remove_faculty(text) from public, anon;
grant execute on function public.admin_save_faculty(text, text, text, text), public.admin_remove_faculty(text) to authenticated;

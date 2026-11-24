-- 0044: Active semesters, and "my classes" only from the timetable.
--
-- 1. Semesters 3 to 8, each active or not. An admin switches a semester off when its timetable
--    is not running (e.g. the even semesters during an odd term) and on again when it starts.
--    The classes of a semester that is off are not shown anywhere: home, room week, class
--    timetable, free rooms, faculty free/busy, My classes and the calendar link. Their rooms show
--    as free. The timetable itself is kept, so switching a semester back on brings its classes
--    back at once. Classes that name no semester (e.g. SKILL) and department slots always show.
--    Every semester starts switched on, so nothing changes until an admin switches one off.
--    The admin timetable editors still see every class (get_timetable(…, true)).
--
-- 2. My classes (dashboard, calendar link, free/busy) come only from the timetable and from
--    bookings that are really the person's: their own approved requests and bookings that name
--    their initials. A class an admin booked or moved for someone else (a skill lab, a class
--    moved for an event) carried the admin's email and showed as the admin's class; it no longer
--    does.
--
-- Depends on 0030 (subject_semesters) and 0037. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Semesters and whether each is active
-- ---------------------------------------------------------------------------

create table if not exists public.semester_status (
  semester   text primary key check (semester ~ '^[1-8]$'),
  active     boolean not null default true,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.semester_status enable row level security;
drop policy if exists "anyone reads semester status" on public.semester_status;
create policy "anyone reads semester status" on public.semester_status for select using (true);
grant select on public.semester_status to anon, authenticated;

insert into public.semester_status (semester) values ('3'), ('4'), ('5'), ('6'), ('7'), ('8')
on conflict (semester) do nothing;

drop trigger if exists log_activity on public.semester_status;
create trigger log_activity after insert or update or delete on public.semester_status
  for each row execute function public.log_activity();

-- Whether a timetable class is shown: it names no semester, or at least one of its semesters is
-- active (a semester not in the list counts as active).
create or replace function public.semester_shown(p_subject text) returns boolean
language sql stable security definer set search_path = public as $$
  select cardinality(public.subject_semesters(p_subject)) = 0
      or exists (select 1 from unnest(public.subject_semesters(p_subject)) s
                  where coalesce((select st.active from public.semester_status st where st.semester = s), true))
$$;
grant execute on function public.semester_shown(text) to anon, authenticated;

create or replace function public.admin_set_semester_active(p_semester text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_sem text := btrim(coalesce(p_semester, ''));
begin
  if v_sem !~ '^[1-8]$' then
    raise exception 'Pick a semester from 1 to 8' using errcode = 'P0001';
  end if;
  insert into public.semester_status (semester, active, updated_by, updated_at)
  values (v_sem, coalesce(p_active, true), me.email, now())
  on conflict (semester) do update set active = excluded.active, updated_by = excluded.updated_by, updated_at = now();
end $$;
revoke execute on function public.admin_set_semester_active(text, boolean) from public, anon;
grant execute on function public.admin_set_semester_active(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The timetable readers skip semesters that are off
-- ---------------------------------------------------------------------------

-- p_all: every class, for the admin editors (admins only)
drop function if exists public.get_timetable(date);
create or replace function public.get_timetable(p_date date, p_all boolean default false)
returns table (room_id text, slot_id int, subject text, faculty_initials text[], faculty_name text, is_department boolean)
language sql stable security definer set search_path = public as $$
  select t.room_id, t.slot_id, t.subject, t.faculty_initials,
         public.faculty_display(t.faculty_initials, t.faculty_label), t.is_department
  from public.timetable_entries t
  where t.version_id = (select v.id from public.timetable_versions v
                         where p_date between v.valid_from and v.valid_to
                         order by v.valid_from desc, v.id desc limit 1)
    and t.weekday = public.day_order(p_date)
    and ((p_all and public.is_admin()) or public.semester_shown(t.subject))
$$;
grant execute on function public.get_timetable(date, boolean) to anon, authenticated;

drop function if exists public.get_timetable_all(date);
create or replace function public.get_timetable_all(p_date date, p_all boolean default false)
returns table (room_id text, weekday int, slot_id int, subject text, faculty_initials text[], faculty_label text, is_department boolean)
language sql stable security definer set search_path = public as $$
  select t.room_id, t.weekday, t.slot_id, t.subject, t.faculty_initials, t.faculty_label, t.is_department
  from public.timetable_entries t
  where t.version_id = (select v.id from public.timetable_versions v
                         where p_date between v.valid_from and v.valid_to
                         order by v.valid_from desc, v.id desc limit 1)
    and ((p_all and public.is_admin()) or public.semester_shown(t.subject))
$$;
grant execute on function public.get_timetable_all(date, boolean) to anon, authenticated;

-- What every room is doing in every slot of a day (as in 0037), with semesters that are off left
-- out of the timetable, and "mine" only for my own classes and bookings.
create or replace function public.get_day_schedule(p_date date)
RETURNS TABLE(room_id text, room_name text, slot_id smallint, slot_label text, starts time without time zone, ends time without time zone, status text, subject text, faculty_name text, reason text, is_mine boolean, ended boolean, original_subject text, original_faculty text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET jit TO 'off'
    AS $$
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
      -- Saturday afternoon: closed unless an admin took the room for a CIE or event, or the timetable has a class
      when public.slot_closed(p_date, s.id) and (l.kind is null and t.id is null or l.kind in ('drop', 'restore') and t.id is null or l.kind = 'drop') then 'closed'
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
      when l.kind = 'class_request' and l.request_id is null then coalesce(l.faculty_name, 'No faculty assigned')
      when l.kind in ('class_request', 'event_request', 'cie', 'event') then l.faculty_name
      when l.kind = 'drop' then null
      when t.id is not null then public.faculty_display(t.faculty_initials, t.faculty_label)
    end,
    case
      when l.kind in ('class_request', 'event_request', 'cie', 'event') then l.reason
      when l.kind = 'drop' then 'Class dropped: ' || l.reason
    end,
    case
      -- My own request that was approved, or a booking that names me as its faculty. A class an
      -- admin booked or moved (a skill lab, a class moved for an event) carries the admin's
      -- email, but it is not the admin's class unless it names their initials.
      when l.kind in ('class_request', 'event_request') then
        coalesce(l.request_id is not null and l.faculty_email = (select email from me), false)
        or coalesce((select initials from me) = any (string_to_array(replace(l.faculty_initials, ' ', ''), ',')), false)
      when l.kind is null or l.kind = 'restore' then
        coalesce((select initials from me) = any (t.faculty_initials), false)
      else false
    end,
    public.slot_has_ended(p_date, s.id),
    -- A class moved here for a skill lab took a room that was free (or freed): it replaced nothing
    case when l.kind in ('class_request', 'event_request', 'cie', 'event') and t.id is not null and not public.is_moved_class(l.kind, l.reason) then
      case when t.is_department then t.subject || ' department' else t.subject end
    end,
    case when l.kind in ('class_request', 'event_request', 'cie', 'event') and t.id is not null and not t.is_department and not public.is_moved_class(l.kind, l.reason) then
      public.faculty_display(t.faculty_initials, t.faculty_label)
    end
  from public.rooms r
  cross join public.slots s
  left join public.timetable_entries t
    on t.version_id = (select id from ver)
   and t.room_id = r.id and t.slot_id = s.id
   and t.weekday = public.day_order(p_date)
   and public.semester_shown(t.subject)
   and not exists (select 1 from public.holidays h where h.date = p_date)
  left join latest l on l.room_id = r.id and l.slot_id = s.id
  where public.is_working_day(p_date)
    and not r.archived
  order by s.starts, r.sort_order, r.id
$$;
grant execute on function public.get_day_schedule(date) to anon, authenticated;

-- Every faculty member, free or busy, in every slot of a day (as in 0035), with semesters that
-- are off left out, and a class an admin booked counted for its own faculty, not the admin.
create or replace function public.faculty_status(p_date date) RETURNS TABLE(initials text, name text, cluster text, slot_id smallint, busy boolean, activity text, room_id text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET jit TO 'off'
    AS $$
  with
  ver as (
    select v.id from public.timetable_versions v
    where p_date between v.valid_from and v.valid_to
    order by v.valid_from desc, v.id desc limit 1
  ),
  open_day as (
    select public.is_working_day(p_date)
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
      and t.weekday = public.day_order(p_date)
      and not t.is_department
      and public.semester_shown(t.subject)
      and (l.kind is null or l.kind = 'restore')
  ),
  booked as (
    -- A booking's faculty, and every faculty member named for an event, CIE or SEE
    select ini, l.slot_id, l.title as activity, l.room_id
    from latest l left join public.people p on p.email = l.faculty_email
    cross join lateral unnest(string_to_array(
      case when l.kind in ('class_request', 'event_request')
           -- the requester of an approved request; a class an admin booked names its own faculty
           then coalesce(l.faculty_initials, case when l.request_id is not null then p.initials end)
           else l.faculty_initials end, ',')) as ini
    where l.kind in ('class_request', 'event_request', 'event', 'cie')
  ),
  duties as (
    select d.initials as ini, d.slot_id, 'Other duty'::text as activity, null::text as room_id
    from public.faculty_duties d
    where d.weekday = public.day_order(p_date)
  ),
  -- A faculty member on leave is busy all day, whatever else they had
  on_leave as (
    select lv.initials as ini, s.id as slot_id, 'On leave'::text as activity, null::text as room_id
    from public.faculty_leave lv cross join public.slots s
    where p_date between lv.starts_on and lv.ends_on
  ),
  busy as (
    select * from classes union all select * from booked union all select * from duties union all select * from on_leave
  ),
  -- Grouped once, then joined, instead of searching the whole list for every faculty member and slot
  busy_by_slot as (
    select ini, slot_id::int as slot_id, string_agg(distinct activity, ' / ') as activity, string_agg(distinct room_id, ', ') as room_id
    from busy group by ini, slot_id
  ),
  faculty as (
    select initials from public.faculty_directory
    union select initials from public.people where initials is not null and active
    union select unnest(t.faculty_initials) from public.timetable_entries t
           where t.version_id = (select id from ver) and not t.is_department and public.semester_shown(t.subject)
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
  left join busy_by_slot b on b.ini = f.initials and b.slot_id = s.id
  where (select ok from open_day)
    and not public.slot_closed(p_date, s.id)
  order by s.starts, f.initials
$$;
grant execute on function public.faculty_status(date) to anon, authenticated;

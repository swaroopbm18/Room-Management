-- 1. Past records: admins can record a CIE, event or class on a date that has already gone by,
--    so the department's records are complete. Faculty requests still can't be for a slot that
--    has ended (booking_window_check, unchanged), and nothing already recorded can be changed.
-- 2. Class as an allotment reason: admins allot a room for a class, naming the faculty member
--    who takes it or leaving it as "No faculty assigned". It is stored as a class booking
--    (kind 'class_request' with no request), so every page that reads bookings (home, room week,
--    slot page, free and busy faculty, My week, report, history) shows it the same way.
-- 3. What was replaced: when an event, CIE or booking takes the place of a regular class, the
--    schedule, the upcoming bookings and the report say which class it replaced and whose it was.
-- Depends on 0025.

-- ---------------------------------------------------------------------------
-- Faculty initials on a booking, for a class assigned to someone who hasn't signed in yet
-- ---------------------------------------------------------------------------

alter table public.allotments add column if not exists faculty_initials text;

-- Edits, renames and undoing a drop copy a booking row without its initials; carry them over
-- from the row being copied (same slot, same faculty name), so the class stays theirs.
create or replace function public.allotments_fill_initials() returns trigger
language plpgsql as $$
begin
  if new.faculty_initials is null and new.kind = 'class_request' and new.request_id is null and new.faculty_name is not null then
    select a.faculty_initials into new.faculty_initials
      from public.allotments a
     where a.room_id = new.room_id and a.date = new.date and a.slot_id = new.slot_id
       and a.kind = 'class_request' and a.request_id is null
       and a.faculty_name = new.faculty_name and a.faculty_initials is not null
     order by a.id desc limit 1;
  end if;
  return new;
end $$;
drop trigger if exists allotments_fill_initials on public.allotments;
create trigger allotments_fill_initials before insert on public.allotments
  for each row execute function public.allotments_fill_initials();

-- ---------------------------------------------------------------------------
-- 1. Past slots: only an admin's own CIE, event or class record may be added
-- ---------------------------------------------------------------------------

create or replace function public.allotments_guard_insert() returns trigger
language plpgsql as $$
begin
  if public.slot_has_ended(new.date, new.slot_id)
     and not (coalesce(current_setting('app.past_record', true), '') = 'on'
              and public.is_admin()
              and new.kind in ('cie', 'event', 'class_request')
              and new.request_id is null) then
    raise exception 'This slot has already ended; past allotments cannot be changed'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Allot a room for a class, CIE or event, now or (admins only) in the past
-- ---------------------------------------------------------------------------

drop function if exists public.admin_override_slots(text, date, int[], public.allotment_kind, text, text);
drop function if exists public.admin_override(text, date, int, public.allotment_kind, text, text);

create or replace function public.admin_override(
  p_room text, p_date date, p_slot int, p_kind public.allotment_kind, p_title text, p_reason text,
  p_faculty text default null   -- initials of the faculty member who takes a class; null = no faculty assigned
) returns void language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_past boolean := public.slot_has_ended(p_date, p_slot);
  v_ini text := nullif(upper(btrim(coalesce(p_faculty, ''))), '');
  v_email text;
  v_name text;
begin
  if p_kind not in ('cie', 'event', 'class_request') then
    raise exception 'A room can be allotted for a class, a CIE or an event' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Please add a description' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.rooms where id = p_room) then
    raise exception 'Room not found' using errcode = 'P0001';
  end if;

  if v_past then
    -- A record of something that already happened: same rules as booking, except the date
    if extract(isodow from p_date) = 7 then
      raise exception 'Rooms cannot be booked on Sundays' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.timetable_versions where p_date between valid_from and valid_to) then
      raise exception 'This date is outside the current semester' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.holidays where date = p_date) then
      raise exception 'That day was a holiday' using errcode = 'P0001';
    end if;
    perform set_config('app.past_record', 'on', true);
  else
    perform public.booking_window_check(p_date, p_slot);
  end if;

  if p_kind = 'class_request' then
    if v_ini is not null then
      if not exists (select 1 from public.people where initials = v_ini and active)
         and not exists (select 1 from public.faculty_directory where initials = v_ini)
         and not exists (select 1 from public.timetable_entries where v_ini = any (faculty_initials)) then
        raise exception 'No faculty member has the initials %', v_ini using errcode = 'P0001';
      end if;
      select email into v_email from public.people where initials = v_ini and active limit 1;
      v_name := public.faculty_display(array[v_ini], null);
    end if;
  else
    v_ini := null;
    v_email := me.email;
    v_name := public.display_name(me);
  end if;

  insert into public.allotments (room_id, date, slot_id, kind, title, faculty_email, faculty_name, faculty_initials, reason, created_by)
  values (p_room, p_date, p_slot, p_kind,
          coalesce(nullif(btrim(p_title), ''), case p_kind when 'cie' then 'CIE' when 'event' then 'Event' else 'Class' end),
          v_email, v_name, v_ini, btrim(p_reason), me.email);

  -- Requests for a slot that has ended can't change, and there is nothing to decline
  if not v_past then
    perform public.reject_others(p_room, p_date, p_slot, null,
      case p_kind when 'class_request' then 'Slot taken for a class' else 'Slot taken for a ' || upper(p_kind::text) end,
      me.email);
  end if;
end $$;

create or replace function public.admin_override_slots(
  p_room text, p_date date, p_slots int[], p_kind public.allotment_kind, p_title text, p_reason text,
  p_faculty text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_slot int;
begin
  perform public.require_admin();
  if coalesce(array_length(p_slots, 1), 0) = 0 then
    raise exception 'Pick at least one slot' using errcode = 'P0001';
  end if;
  foreach v_slot in array p_slots loop
    perform public.admin_override(p_room, p_date, v_slot, p_kind, p_title, p_reason, p_faculty);
  end loop;
end $$;

revoke execute on function public.admin_override(text, date, int, public.allotment_kind, text, text, text) from public, anon;
grant execute on function public.admin_override(text, date, int, public.allotment_kind, text, text, text) to authenticated;
revoke execute on function public.admin_override_slots(text, date, int[], public.allotment_kind, text, text, text) from public, anon;
grant execute on function public.admin_override_slots(text, date, int[], public.allotment_kind, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The regular class in a room and slot on a date (what a booking replaced)
-- ---------------------------------------------------------------------------

create or replace function public.regular_class(p_room text, p_date date, p_slot int)
returns table (subject text, faculty text)
language sql stable security definer set search_path = public as $$
  select case when t.is_department then t.subject || ' department' else t.subject end,
         case when t.is_department then null else public.faculty_display(t.faculty_initials, t.faculty_label) end
  from public.timetable_entries t
  where t.version_id = (select v.id from public.timetable_versions v
                         where p_date between v.valid_from and v.valid_to
                         order by v.valid_from desc, v.id desc limit 1)
    and t.room_id = p_room and t.slot_id = p_slot
    and t.weekday = public.day_order(p_date)
    and not exists (select 1 from public.holidays h where h.date = p_date)
  limit 1
$$;
grant execute on function public.regular_class(text, date, int) to anon, authenticated;

-- The day's schedule, now with the class a booking replaced (original_subject, original_faculty).
drop function if exists public.get_day_schedule(date);
create function public.get_day_schedule(p_date date)
returns table (
  room_id          text,
  room_name        text,
  slot_id          smallint,
  slot_label       text,
  starts           time,
  ends             time,
  status           text,      -- free | class | department | booked | cie | event | closed
  subject          text,
  faculty_name     text,
  reason           text,
  is_mine          boolean,   -- the signed-in faculty teaches / booked it
  ended            boolean,
  original_subject text,      -- the regular class a booking, CIE or event took the place of
  original_faculty text
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
      when l.kind in ('class_request', 'event_request') then
        coalesce(l.faculty_email = (select email from me), false)
        or coalesce(l.faculty_initials = (select initials from me), false)
      when l.kind is null or l.kind = 'restore' then
        coalesce((select initials from me) = any (t.faculty_initials), false)
      else false
    end,
    public.slot_has_ended(p_date, s.id),
    case when l.kind in ('class_request', 'event_request', 'cie', 'event') and t.id is not null then
      case when t.is_department then t.subject || ' department' else t.subject end
    end,
    case when l.kind in ('class_request', 'event_request', 'cie', 'event') and t.id is not null and not t.is_department then
      public.faculty_display(t.faculty_initials, t.faculty_label)
    end
  from public.rooms r
  cross join public.slots s
  left join public.timetable_entries t
    on t.version_id = (select id from ver)
   and t.room_id = r.id and t.slot_id = s.id
   and t.weekday = public.day_order(p_date)
   and not exists (select 1 from public.holidays h where h.date = p_date)
  left join latest l on l.room_id = r.id and l.slot_id = s.id
  where extract(isodow from p_date) between 1 and 6
    and not r.archived
  order by s.starts, r.sort_order, r.id
$$;
grant execute on function public.get_day_schedule(date) to anon, authenticated;

-- Upcoming bookings, with whether an admin allotted it and the class it replaced.
drop function if exists public.upcoming_bookings(int);
create function public.upcoming_bookings(p_days int default 14)
returns table (
  date             date,
  room_id          text,
  slot_id          smallint,
  kind             public.allotment_kind,
  title            text,
  faculty_name     text,
  reason           text,
  approved_by      text,
  allotted         boolean,   -- an admin allotted it directly (no faculty request)
  original_subject text,
  original_faculty text
)
language sql stable security definer set search_path = public as $$
  select l.date, l.room_id, l.slot_id, l.kind, l.title, l.faculty_name, l.reason,
         coalesce(public.display_name(p), l.approver),
         l.request_id is null,
         o.subject, o.faculty
  from (
    select distinct on (a.date, a.room_id, a.slot_id) a.*, coalesce(r.decided_by, a.created_by) as approver
    from public.allotments a
    left join public.requests r on r.id = a.request_id
    where a.date between public.ist_today() and public.ist_today() + least(greatest(p_days, 0), 31)
    order by a.date, a.room_id, a.slot_id, a.id desc
  ) l
  left join public.people p on p.email = l.approver
  left join lateral public.regular_class(l.room_id, l.date, l.slot_id) o on true
  where l.kind in ('class_request', 'event_request', 'cie', 'event')
    and not public.slot_has_ended(l.date, l.slot_id)
  order by l.date, l.slot_id, l.room_id
$$;
grant execute on function public.upcoming_bookings(int) to anon, authenticated;

-- The report, with whether a class came from a request and whose class an event replaced.
drop function if exists public.get_change_report(date, date);
create function public.get_change_report(p_from date, p_to date)
returns table (
  date date, slot_id int, starts time, ends time, room_id text,
  kind public.allotment_kind, title text, faculty_name text, reason text, subject text,
  request_id uuid, original_faculty text
)
language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (a.date, a.room_id, a.slot_id) a.*
    from public.allotments a
    where a.date between p_from and p_to
    order by a.date, a.room_id, a.slot_id, a.id desc
  )
  select l.date, l.slot_id, s.starts, s.ends, l.room_id, l.kind, l.title, l.faculty_name, l.reason,
         o.subject, l.request_id, o.faculty
  from latest l
  join public.slots s on s.id = l.slot_id
  left join lateral public.regular_class(l.room_id, l.date, l.slot_id) o on true
  where l.kind <> 'restore' and public.is_admin()
  order by l.date, s.starts, l.room_id
$$;
revoke execute on function public.get_change_report(date, date) from public, anon;
grant execute on function public.get_change_report(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Free and busy faculty: a class an admin assigned by initials makes that faculty member busy
-- (same as 0023 otherwise)
-- ---------------------------------------------------------------------------

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
      and t.weekday = public.day_order(p_date)
      and not t.is_department
      and (l.kind is null or l.kind = 'restore')
  ),
  booked as (
    select coalesce(l.faculty_initials, p.initials) as ini, l.slot_id, l.title as activity, l.room_id
    from latest l left join public.people p on p.email = l.faculty_email
    where l.kind in ('class_request', 'event_request') and coalesce(l.faculty_initials, p.initials) is not null
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
    and not public.slot_closed(p_date, s.id)
  order by s.starts, f.initials
$$;
grant execute on function public.faculty_status(date) to anon, authenticated;

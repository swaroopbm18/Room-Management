-- 0037: Skill lab.
-- An admin books a skill lab for some sections (e.g. 3B, 3D, 3F and 3G) in some labs, at some
-- times, on one or more days, and in one go:
--   1. the regular classes of those sections at those times are released ("3B at Skill Lab"),
--      since the students are at the skill lab, so their rooms are free;
--   2. the labs are booked for the skill lab;
--   3. the classes of other sections that lost their lab to it are moved to a free room (the
--      released rooms first) at the same time, or else to a free time the same day when the
--      class, its faculty and a room are all free. The website works out the moves and shows
--      them before anything is saved; this function saves them, all or none.
-- A moved class is a booked class whose description starts "Moved from <room>"; it took a free
-- room, so it is not shown as replacing the class that room had.
-- Depends on 0035. Safe to run more than once.

-- Whether an allotment is a class moved for a skill lab
create or replace function public.is_moved_class(p_kind public.allotment_kind, p_reason text)
returns boolean language sql immutable as $$
  select p_kind = 'class_request' and coalesce(p_reason, '') like 'Moved from %'
$$;

create or replace function public.get_day_schedule(p_date date) RETURNS TABLE(room_id text, room_name text, slot_id smallint, slot_label text, starts time without time zone, ends time without time zone, status text, subject text, faculty_name text, reason text, is_mine boolean, ended boolean, original_subject text, original_faculty text)
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
      when l.kind in ('class_request', 'event_request') then
        coalesce(l.faculty_email = (select email from me), false)
        or coalesce(l.faculty_initials = (select initials from me), false)
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
   and not exists (select 1 from public.holidays h where h.date = p_date)
  left join latest l on l.room_id = r.id and l.slot_id = s.id
  where public.is_working_day(p_date)
    and not r.archived
  order by s.starts, r.sort_order, r.id
$$;

-- The same in the list of upcoming bookings and in the report
create or replace function public.get_change_report(p_from date, p_to date) RETURNS TABLE(date date, slot_id integer, starts time without time zone, ends time without time zone, room_id text, kind public.allotment_kind, title text, faculty_name text, reason text, subject text, request_id uuid, original_faculty text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET jit TO 'off'
    AS $$
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
  left join lateral public.regular_class(l.room_id, l.date, l.slot_id) o on not public.is_moved_class(l.kind, l.reason)
  where l.kind <> 'restore' and public.is_admin()
  order by l.date, s.starts, l.room_id
$$;

create or replace function public.upcoming_bookings(p_days integer DEFAULT 14) RETURNS TABLE(date date, room_id text, slot_id smallint, kind public.allotment_kind, title text, faculty_name text, reason text, approved_by text, allotted boolean, original_subject text, original_faculty text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET jit TO 'off'
    AS $$
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
  left join lateral public.regular_class(l.room_id, l.date, l.slot_id) o on not public.is_moved_class(l.kind, l.reason)
  where l.kind in ('class_request', 'event_request', 'cie', 'event')
    and not public.slot_has_ended(l.date, l.slot_id)
  order by l.date, l.slot_id, l.room_id
$$;

-- p_places:   [{"room": "MEL-LAB-01", "date": "2026-11-24", "slots": [1, 2, 3]}, …], the skill lab
-- p_releases: [{"room": "MEL-CR-03", "date": "2026-11-24", "slot": 1, "section": "3B"}, …],
--             classes of the skill lab's sections to release
-- p_moves:    [{"room": "MEL-CR-03", "date": "2026-11-24", "slot": 1, "subject": "DBMS(P)-3A",
--               "faculty": "SM,MHM", "from": "MEL-LAB-02"}, …], classes moved out of the labs
--             ("from" may name the time too: "MEL-LAB-02, 8:00 AM")
create or replace function public.admin_skill_lab(
  p_title text, p_reason text, p_faculty text, p_places jsonb, p_releases jsonb, p_moves jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_title text := coalesce(nullif(btrim(coalesce(p_title, '')), ''), 'Skill Lab');
  v_reason text := btrim(coalesce(p_reason, ''));
  v_ini text;
  v_name text;
  p jsonb;
  v_slot int;
  v_date date;
  v_status text;
  v_booked int := 0;
  v_released int := 0;
  v_moved int := 0;
  v_mini text[];
  v_label text := regexp_replace(coalesce(nullif(btrim(coalesce(p_title, '')), ''), 'Skill Lab'), '\s*-\s*[0-9][A-Za-z0-9/,& ]*$', '');
begin
  if length(v_reason) < 5 then
    raise exception 'Please add a description' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_places) <> 'array' or jsonb_array_length(p_places) = 0 then
    raise exception 'Pick at least one lab and time' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_faculty, '')), '') is not null then
    select r.initials, r.name into v_ini, v_name from public.resolve_faculty(p_faculty) r;
  else
    v_name := public.display_name(me);
  end if;

  -- 1. Release the sections' own classes
  for p in select * from jsonb_array_elements(coalesce(p_releases, '[]'::jsonb)) loop
    v_date := (p ->> 'date')::date;
    v_slot := (p ->> 'slot')::int;
    perform public.booking_window_check(v_date, v_slot);
    if public.slot_has_started(v_date, v_slot) then
      raise exception 'The class in % at % has already started', p ->> 'room', (select label from public.slots where id = v_slot) using errcode = 'P0001';
    end if;
    select s.status into v_status from public.get_day_schedule(v_date) s where s.room_id = p ->> 'room' and s.slot_id = v_slot;
    continue when v_status is distinct from 'class' and v_status is distinct from 'booked';
    insert into public.allotments (room_id, date, slot_id, kind, title, faculty_name, reason, created_by)
    select s.room_id, v_date, v_slot, 'drop', coalesce(s.subject, 'Class'), s.faculty_name,
           coalesce(nullif(p ->> 'section', ''), 'Class') || ' at ' || v_label, me.email
      from public.get_day_schedule(v_date) s where s.room_id = p ->> 'room' and s.slot_id = v_slot;
    v_released := v_released + 1;
  end loop;

  -- 2. Book the labs
  for p in select * from jsonb_array_elements(p_places) loop
    v_date := (p ->> 'date')::date;
    if not exists (select 1 from public.rooms where id = p ->> 'room') then
      raise exception 'Room % not found', p ->> 'room' using errcode = 'P0001';
    end if;
    for v_slot in select x::int from jsonb_array_elements_text(p -> 'slots') x loop
      perform public.booking_window_check(v_date, v_slot);
      insert into public.allotments (room_id, date, slot_id, kind, title, faculty_email, faculty_name, faculty_initials, reason, created_by)
      values (p ->> 'room', v_date, v_slot, 'class_request', v_title, me.email, v_name, v_ini, v_reason, me.email);
      perform public.reject_others(p ->> 'room', v_date, v_slot, null, 'Slot taken for ' || v_label, me.email);
      v_booked := v_booked + 1;
    end loop;
  end loop;

  -- 3. Move the classes that lost their lab, each only into a room that is free now
  for p in select * from jsonb_array_elements(coalesce(p_moves, '[]'::jsonb)) loop
    v_date := (p ->> 'date')::date;
    v_slot := (p ->> 'slot')::int;
    perform public.booking_window_check(v_date, v_slot);
    select s.status into v_status from public.get_day_schedule(v_date) s where s.room_id = p ->> 'room' and s.slot_id = v_slot;
    if v_status is distinct from 'free' then
      raise exception '% is no longer free at %; preview again', p ->> 'room', (select label from public.slots where id = v_slot) using errcode = 'P0001';
    end if;
    select array_agg(x) into v_mini from unnest(string_to_array(upper(regexp_replace(coalesce(p ->> 'faculty', ''), '\s', '', 'g')), ',')) x where x <> '';
    insert into public.allotments (room_id, date, slot_id, kind, title, faculty_email, faculty_name, faculty_initials, reason, created_by)
    values (p ->> 'room', v_date, v_slot, 'class_request', coalesce(nullif(btrim(p ->> 'subject'), ''), 'Class'), me.email,
            case when v_mini is null then null else public.faculty_display(v_mini, null) end,
            array_to_string(v_mini, ','),
            'Moved from ' || coalesce(nullif(btrim(p ->> 'from'), ''), 'its lab') || ' for ' || v_label, me.email);
    perform public.reject_others(p ->> 'room', v_date, v_slot, null, 'Slot taken for a class moved for ' || v_label, me.email);
    v_moved := v_moved + 1;
  end loop;

  return jsonb_build_object('booked', v_booked, 'released', v_released, 'moved', v_moved);
end $$;
revoke execute on function public.admin_skill_lab(text, text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.admin_skill_lab(text, text, text, jsonb, jsonb, jsonb) to authenticated;

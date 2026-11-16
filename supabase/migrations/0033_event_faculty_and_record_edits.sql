-- 0033:
-- 1. Faculty in charge of an event: an admin allotting an event can name a faculty member in
--    charge (optional). They show as the event's faculty on the timetable and in the report.
-- 2. Editing records from the report: admins can change the name, description and faculty of a
--    CIE, event or class already recorded, past ones included. As with every change, the old rows
--    stay in History; the edit adds new rows.
-- 3. A CIE shows "CIE Co-ordinators" unless a faculty member is named for it.
-- Depends on 0032. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Allot: faculty in charge of an event
-- ---------------------------------------------------------------------------

create or replace function public.admin_override(p_room text, p_date date, p_slot integer, p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
    if not public.is_working_day(p_date) then
      raise exception 'That Sunday was not a working day' using errcode = 'P0001';
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

  if p_kind in ('class_request', 'event') and v_ini is not null then
      -- A class's faculty, or an event's faculty in charge (optional)
      if not exists (select 1 from public.people where initials = v_ini and active)
         and not exists (select 1 from public.faculty_directory where initials = v_ini)
         and not exists (select 1 from public.timetable_entries where v_ini = any (faculty_initials)) then
        raise exception 'No faculty member has the initials %', v_ini using errcode = 'P0001';
      end if;
      v_name := public.faculty_display(array[v_ini], null);
      if p_kind = 'class_request' then
        select email into v_email from public.people where initials = v_ini and active limit 1;
      else
        v_email := me.email;  -- an event stays the allotting admin's, with its faculty in charge named
      end if;
  elsif p_kind = 'class_request' then
    v_ini := null;
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

-- ---------------------------------------------------------------------------
-- 3. CIE Co-ordinators, unless a faculty member is named
-- ---------------------------------------------------------------------------

create or replace function public.allotments_cie_coordinators() returns trigger
language plpgsql as $$
begin
  if new.kind = 'cie' and new.faculty_initials is null then
    new.faculty_name := 'CIE Co-ordinators';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Edit a record (from the report), past or future
-- ---------------------------------------------------------------------------

-- An admin's edit of a booking may add rows to a slot that has ended (app.record_edit, set by
-- admin_edit_record only). Everything else about past slots stays as it was.
create or replace function public.allotments_guard_insert() returns trigger
language plpgsql as $$
begin
  if public.slot_has_ended(new.date, new.slot_id)
     and not (coalesce(current_setting('app.past_record', true), '') = 'on'
              and public.is_admin()
              and new.kind in ('cie', 'event', 'class_request')
              and new.request_id is null)
     and not (coalesce(current_setting('app.record_edit', true), '') = 'on'
              and public.is_admin()
              and new.kind in ('cie', 'event', 'class_request', 'event_request')) then
    raise exception 'This slot has already ended; past allotments cannot be changed'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Changes the name, description and (optionally) faculty of a booking in the given slots.
-- p_faculty: null keeps the faculty, '-' clears it, initials name a faculty member.
create or replace function public.admin_edit_record(
  p_room text, p_date date, p_slots int[], p_title text, p_reason text, p_faculty text default null
) returns int language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_title text := btrim(coalesce(p_title, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_ini text := nullif(upper(btrim(coalesce(p_faculty, ''))), '');
  v_name text;
  v_slot int;
  cur public.allotments;
  v_n int := 0;
begin
  if coalesce(array_length(p_slots, 1), 0) = 0 then
    raise exception 'Pick at least one slot' using errcode = 'P0001';
  end if;
  if length(v_title) > 80 then
    raise exception 'The name can be at most 80 characters' using errcode = 'P0001';
  end if;
  if length(v_reason) < 3 or length(v_reason) > 500 then
    raise exception 'The description must be 3 to 500 characters' using errcode = 'P0001';
  end if;
  if v_ini is not null and v_ini <> '-' then
    if not exists (select 1 from public.people where initials = v_ini and active)
       and not exists (select 1 from public.faculty_directory where initials = v_ini)
       and not exists (select 1 from public.timetable_entries where v_ini = any (faculty_initials)) then
      raise exception 'No faculty member has the initials %', v_ini using errcode = 'P0001';
    end if;
    v_name := public.faculty_display(array[v_ini], null);
  end if;
  perform set_config('app.record_edit', 'on', true);

  foreach v_slot in array p_slots loop
    select * into cur from public.allotments
     where room_id = p_room and date = p_date and slot_id = v_slot order by id desc limit 1;
    if cur.id is null or cur.kind not in ('class_request', 'event_request', 'cie', 'event') then
      raise exception 'Only a booked class, event or CIE can be edited' using errcode = 'P0001';
    end if;
    insert into public.allotments (room_id, date, slot_id, kind, title, faculty_email, faculty_name, faculty_initials,
                                   reason, request_id, created_by)
    values (cur.room_id, cur.date, cur.slot_id, cur.kind,
            coalesce(nullif(v_title, ''), cur.title),
            cur.faculty_email,
            case when v_ini is null then cur.faculty_name when v_ini = '-' then null else v_name end,
            case when v_ini is null then cur.faculty_initials when v_ini = '-' then null else v_ini end,
            v_reason, cur.request_id, me.email);
    v_n := v_n + 1;
  end loop;
  perform set_config('app.record_edit', '', true);
  return v_n;
end $$;

revoke execute on function public.admin_edit_record(text, date, int[], text, text, text) from public, anon;
grant execute on function public.admin_edit_record(text, date, int[], text, text, text) to authenticated;

-- 0034:
-- 1. SEE (semester end exam): allotted like a CIE (kind 'cie', name starting "SEE"). Its faculty
--    shows as "SEE Co-ordinators" unless a faculty member is named.
-- 2. One event in several rooms and at several times: admin_override_many allots them all in one
--    go, so either every room and time is allotted or none is.
-- 3. Deleting a wrong record, past ones included: admin_delete_record puts the slots back to the
--    timetable (a 'restore' row). As with every change, the old rows stay in History.
-- Depends on 0033. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. SEE Co-ordinators
-- ---------------------------------------------------------------------------

create or replace function public.allotments_cie_coordinators() returns trigger
language plpgsql as $$
begin
  if new.kind = 'cie' and new.faculty_initials is null then
    new.faculty_name := case when coalesce(new.title, '') ~* '^\s*SEE\M' then 'SEE Co-ordinators' else 'CIE Co-ordinators' end;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Several rooms and times for one event
-- ---------------------------------------------------------------------------

-- p_places: [{"date": "2026-11-20", "room": "MEL SH", "slots": [1, 2, 3]}, ...]
create or replace function public.admin_override_many(
  p_places jsonb, p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text default null
) returns int language plpgsql security definer set search_path = public as $$
declare
  p jsonb;
  v_slots int[];
  v_n int := 0;
begin
  perform public.require_admin();
  if jsonb_typeof(p_places) <> 'array' or jsonb_array_length(p_places) = 0 then
    raise exception 'Pick at least one room and time' using errcode = 'P0001';
  end if;
  for p in select * from jsonb_array_elements(p_places) loop
    select coalesce(array_agg(x::int), '{}') into v_slots from jsonb_array_elements_text(p -> 'slots') x;
    perform public.admin_override_slots(p ->> 'room', (p ->> 'date')::date, v_slots, p_kind, p_title, p_reason, p_faculty);
    v_n := v_n + cardinality(v_slots);
  end loop;
  return v_n;
end $$;

revoke execute on function public.admin_override_many(jsonb, public.allotment_kind, text, text, text) from public, anon;
grant execute on function public.admin_override_many(jsonb, public.allotment_kind, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Delete a record, past or future
-- ---------------------------------------------------------------------------

-- An admin's edit or delete of a record may add rows to a slot that has ended (app.record_edit,
-- set by admin_edit_record and admin_delete_record only). Everything else about past slots stays.
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
              and new.kind in ('cie', 'event', 'class_request', 'event_request', 'restore')) then
    raise exception 'This slot has already ended; past allotments cannot be changed'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Puts the given slots back to the timetable: a booking, CIE, event or class goes, a dropped
-- class comes back. Returns how many slots changed.
create or replace function public.admin_delete_record(p_room text, p_date date, p_slots int[], p_reason text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_slot int;
  cur public.allotments;
  v_n int := 0;
begin
  if coalesce(array_length(p_slots, 1), 0) = 0 then
    raise exception 'Pick at least one slot' using errcode = 'P0001';
  end if;
  perform set_config('app.record_edit', 'on', true);
  foreach v_slot in array p_slots loop
    select * into cur from public.allotments
     where room_id = p_room and date = p_date and slot_id = v_slot order by id desc limit 1;
    continue when cur.id is null or cur.kind = 'restore';
    insert into public.allotments (room_id, date, slot_id, kind, reason, faculty_email, faculty_name, created_by)
    values (p_room, p_date, v_slot, 'restore',
            'Deleted by admin: ' || coalesce(nullif(v_reason, ''), coalesce(nullif(cur.title, ''), cur.kind::text) || ' entered by mistake'),
            me.email, public.display_name(me), me.email);
    v_n := v_n + 1;
  end loop;
  perform set_config('app.record_edit', '', true);
  if v_n = 0 then
    raise exception 'Nothing to delete in these slots' using errcode = 'P0001';
  end if;
  return v_n;
end $$;

revoke execute on function public.admin_delete_record(text, date, int[], text) from public, anon;
grant execute on function public.admin_delete_record(text, date, int[], text) to authenticated;

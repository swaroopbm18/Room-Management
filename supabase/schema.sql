-- The whole database in one file, for a new install: run this, then seed.sql.
--
-- It is the same as running every file in migrations/ in order (0001 to 0036), generated with
-- pg_dump from a database built that way. An existing site keeps running each new migration
-- as before; regenerate this file after adding one (see README, "Database schema").

create extension if not exists pgcrypto;

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: allotment_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.allotment_kind AS ENUM (
    'class_request',
    'event_request',
    'cie',
    'event',
    'drop',
    'restore'
);


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'faculty'
);


--
-- Name: request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'withdrawn'
);


--
-- Name: request_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.request_type AS ENUM (
    'class',
    'event'
);


--
-- Name: resource_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.resource_status AS ENUM (
    'pending',
    'approved',
    'declined',
    'cancelled'
);


--
-- Name: admin_add_holiday(date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_add_holiday(p_date date, p_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_add_leave(text, date, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_add_leave(p_initials text, p_from date, p_to date, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  v_ini text := upper(btrim(coalesce(p_initials, '')));
  v_to date := coalesce(p_to, p_from);
begin
  if v_ini = '' then
    raise exception 'Pick a faculty member' using errcode = 'P0001';
  end if;
  if p_from is null or v_to < p_from then
    raise exception 'The leave must end on or after the day it starts' using errcode = 'P0001';
  end if;
  if v_to - p_from > 90 then
    raise exception 'Leave can be at most 90 days at a time' using errcode = 'P0001';
  end if;
  if v_to < public.ist_today() then
    raise exception 'That leave is already over' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.faculty_leave where initials = v_ini and starts_on <= v_to and ends_on >= p_from) then
    raise exception '% is already on leave on some of those days', v_ini using errcode = 'P0001';
  end if;
  insert into public.faculty_leave (initials, starts_on, ends_on, reason, created_by)
  values (v_ini, p_from, v_to, btrim(coalesce(p_reason, '')), me.email);
end $$;


--
-- Name: admin_add_notice(text, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_add_notice(p_message text, p_starts date, p_ends date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare me public.people := public.require_admin();
begin
  if p_ends < p_starts then
    raise exception 'The notice must end on or after the day it starts' using errcode = 'P0001';
  end if;
  insert into public.notices (message, starts_on, ends_on, created_by) values (btrim(p_message), p_starts, p_ends, me.email);
end $$;


--
-- Name: admin_add_room(text, integer, text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_add_room(p_room text, p_capacity integer, p_kind text, p_projector boolean, p_notes text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  me public.people := public.require_admin();
  v_id text := upper(regexp_replace(coalesce(p_room, ''), '\s+', '', 'g'));
begin
  if v_id !~ '^[A-Z0-9][A-Z0-9-]{0,23}$' then
    raise exception 'Room names are 1 to 24 letters, digits or dashes, e.g. MEL-CR-509' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.rooms where id = v_id) then
    raise exception 'Room % is already on the site', v_id using errcode = 'P0001';
  end if;
  insert into public.rooms (id, name, sort_order, capacity, kind, projector, notes)
  values (v_id, v_id, coalesce((select max(sort_order) + 1 from public.rooms), 0),
          p_capacity, coalesce(nullif(p_kind, ''), 'classroom'), coalesce(p_projector, false), btrim(coalesce(p_notes, '')));
  return v_id;
end $_$;


--
-- Name: admin_add_subject(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_add_subject(p_email text, p_subject text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  v_subject text := upper(regexp_replace(btrim(coalesce(p_subject, '')), '\s+', ' ', 'g'));
begin
  if v_subject = '' then
    raise exception 'Enter a subject, e.g. DBMS-3B' using errcode = 'P0001';
  end if;
  if length(v_subject) > 40 then
    raise exception 'A subject can be at most 40 characters' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.people where email = lower(btrim(p_email))) then
    raise exception 'That person is not on the faculty list' using errcode = 'P0001';
  end if;
  insert into public.faculty_subjects (email, subject, source, created_by)
  values (lower(btrim(p_email)), v_subject, 'admin', me.email)
  on conflict (email, subject) do nothing;
  if not found then
    raise exception '% already has %', lower(btrim(p_email)), v_subject using errcode = 'P0001';
  end if;
end $$;


--
-- Name: admin_archive_room(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_archive_room(p_room text, p_archived boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare me public.people := public.require_admin();
begin
  if not exists (select 1 from public.rooms where id = p_room) then
    raise exception 'No such room' using errcode = 'P0001';
  end if;
  if p_archived then
    if exists (select 1 from public.timetable_entries t join public.timetable_versions v on v.id = t.version_id
               where t.room_id = p_room and v.valid_to >= public.ist_today() + 1) then
      raise exception 'Room % still has classes in the timetable. Move them to another room first.', p_room using errcode = 'P0001';
    end if;
    if exists (select 1 from public.requests where room_id = p_room and status = 'pending' and date >= public.ist_today())
       or exists (select 1 from public.allotments where room_id = p_room and date > public.ist_today() and kind in ('class_request', 'event_request', 'cie', 'event')) then
      raise exception 'Room % has requests or bookings coming up. Free them first.', p_room using errcode = 'P0001';
    end if;
  end if;
  update public.rooms set archived = coalesce(p_archived, false) where id = p_room;
end $$;


--
-- Name: admin_bulk_allot(jsonb, public.allotment_kind, text, text, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_bulk_allot(p_places jsonb, p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text DEFAULT NULL::text, p_semesters text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_slots int;
  v_cancelled int := 0;
  d date;
begin
  perform public.require_admin();
  v_slots := public.admin_override_many(p_places, p_kind, p_title, p_reason, p_faculty);
  if coalesce(array_length(p_semesters, 1), 0) > 0 then
    for d in select distinct (p ->> 'date')::date from jsonb_array_elements(p_places) p order by 1 loop
      v_cancelled := v_cancelled + public.admin_cancel_semester_classes(d, p_semesters,
        coalesce(nullif(btrim(p_title), ''), upper(p_kind::text)) || ', semester ' || array_to_string(p_semesters, ', '));
    end loop;
  end if;
  return jsonb_build_object('slots', v_slots, 'cancelled', v_cancelled);
end $$;


--
-- Name: admin_cancel_semester_classes(date, text[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_cancel_semester_classes(p_date date, p_semesters text[], p_reason text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  d record;
  v_n int := 0;
  v_why text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'semester ' || array_to_string(p_semesters, ', '));
  v_reason text := case when v_why ~* '^SEE\M' then 'Cancelled for SEE: ' else 'Cancelled for CIE: ' end || v_why;
begin
  if coalesce(array_length(p_semesters, 1), 0) = 0 then
    raise exception 'Pick at least one semester' using errcode = 'P0001';
  end if;
  for d in
    select s.* from public.get_day_schedule(p_date) s
     where s.status in ('class', 'booked')
       and not public.slot_has_started(p_date, s.slot_id)
       and public.subject_semesters(s.subject) && p_semesters
  loop
    insert into public.allotments (room_id, date, slot_id, kind, title, faculty_name, reason, created_by)
    values (d.room_id, p_date, d.slot_id, 'drop', coalesce(d.subject, 'Class'), d.faculty_name, v_reason, me.email);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;


--
-- Name: admin_copy_holidays(date, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_copy_holidays(p_from date, p_to date, p_years integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  n int;
begin
  if p_years not between 1 and 2 then
    raise exception 'Copy holidays one or two years ahead' using errcode = 'P0001';
  end if;
  insert into public.holidays (date, name, created_by)
  select (h.date + make_interval(years => p_years))::date, h.name, me.email
  from public.holidays h
  where h.date between p_from and p_to
    and (h.date + make_interval(years => p_years))::date > public.ist_today()
  on conflict (date) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;


--
-- Name: admin_decide_exchange(bigint, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_decide_exchange(p_id bigint, p_approve boolean, p_note text DEFAULT ''::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  x public.class_exchanges;
  st record;
  v_slot int;
begin
  select * into x from public.class_exchanges where id = p_id for update;
  if x.id is null then
    raise exception 'Exchange request not found' using errcode = 'P0001';
  end if;
  if x.status not in ('pending', 'accepted') then
    raise exception 'This request has already been decided or withdrawn' using errcode = 'P0001';
  end if;
  if p_approve then
    if x.status <> 'accepted' then
      raise exception '% has not accepted yet. Approve once they accept.', x.target_name using errcode = 'P0001';
    end if;
    if public.slot_has_started(x.date, x.slot_id) then
      raise exception 'This class has already started' using errcode = 'P0001';
    end if;
    -- Every slot must still be the requester's class, and the colleague still free in it
    foreach v_slot in array public.exchange_slots(x) loop
      select d.status, d.subject into st from public.get_day_schedule(x.date) d where d.room_id = x.room_id and d.slot_id = v_slot;
      if st.status is null or st.status not in ('class', 'booked') or st.subject is distinct from x.subject then
        raise exception 'The class in that slot has changed since the request was sent' using errcode = 'P0001';
      end if;
      if not public.faculty_free_at(x.target_initials, x.date, v_slot) then
        raise exception '% is no longer free in every slot', x.target_name using errcode = 'P0001';
      end if;
    end loop;
    foreach v_slot in array public.exchange_slots(x) loop
      perform public.admin_override(x.room_id, x.date, v_slot, 'class_request',
        coalesce(x.new_subject, x.subject, 'Class'),
        -- e.g. "Class exchange: Dr. Nagrathna C R takes COA-3E in place of DPM-3E (Dr. Rajeshwari M R)"
        case when x.new_subject is not null and x.new_subject is distinct from x.subject
             then 'Class exchange: ' || x.target_name || ' takes ' || x.new_subject || ' in place of ' || coalesce(x.subject, 'the class') || ' (' || x.requester_name || ')'
             else 'Class exchange: ' || x.target_name || ' takes ' || coalesce(x.subject, 'the class') || ' for ' || x.requester_name
        end,
        x.target_initials);
    end loop;
  end if;
  -- Denied: the timetable is left exactly as it is, so the original faculty keeps every slot
  update public.class_exchanges
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = me.email,
         decision_note = nullif(left(btrim(coalesce(p_note, '')), 300), ''),
         decided_at = now()
   where id = p_id;
end $$;


--
-- Name: admin_decide_resource(bigint, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_decide_resource(p_id bigint, p_approve boolean, p_note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  r public.resource_requests;
  s public.supplies;
begin
  select * into r from public.resource_requests where id = p_id for update;
  if r.id is null or r.status <> 'pending' then
    raise exception 'That request was already decided or withdrawn' using errcode = 'P0001';
  end if;
  if p_approve and r.supply_id is not null then
    update public.supplies set stock = stock - r.quantity, updated_at = now()
     where id = r.supply_id and stock >= r.quantity
    returning * into s;
    if s.id is null then
      select * into s from public.supplies where id = r.supply_id;
      raise exception 'Only % % of % left in stock. Update the stock or decline.', coalesce(s.stock, 0), coalesce(s.unit, ''), r.item using errcode = 'P0001';
    end if;
  end if;
  update public.resource_requests
     set status = case when p_approve then 'approved'::public.resource_status else 'declined'::public.resource_status end,
         decided_by = me.email, decided_at = now(), decision_note = btrim(coalesce(p_note, ''))
   where id = p_id;
end $$;


--
-- Name: admin_delete_equipment(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_equipment(p_id integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare me public.people := public.require_admin();
begin
  if exists (select 1 from public.equipment_bookings where equipment_id = p_id) then
    raise exception 'It has bookings on record, so retire it instead' using errcode = 'P0001';
  end if;
  delete from public.equipment where id = p_id;
end $$;


--
-- Name: admin_delete_faculty(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_faculty(p_initials text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  v_ini text := upper(btrim(coalesce(p_initials, '')));
  v_person public.people;
  v_classes int;
begin
  if v_ini = '' then
    raise exception 'Pick a faculty member to delete' using errcode = 'P0001';
  end if;
  if me.initials = v_ini then
    raise exception 'You cannot delete yourself' using errcode = 'P0001';
  end if;

  select count(*) into v_classes
  from public.timetable_entries t
  join public.timetable_versions v on v.id = t.version_id
  where v.valid_to >= public.ist_today() + 1 and v_ini = any (t.faculty_initials);
  if v_classes > 0 then
    raise exception '% still has % class slot(s) in the timetable. Move those classes to someone else in Class timetables first, then delete.', v_ini, v_classes
      using errcode = 'P0001';
  end if;

  delete from public.faculty_duties where initials = v_ini;
  delete from public.faculty_clusters where initials = v_ini;
  delete from public.faculty_directory where initials = v_ini;

  select * into v_person from public.people where initials = v_ini;
  if v_person.email is null then
    return 'deleted';
  end if;
  delete from public.faculty_subjects where email = v_person.email;
  update public.requests set status = 'withdrawn', decided_at = now(), decided_by = me.email
   where requester_email = v_person.email and status = 'pending';
  if exists (select 1 from public.requests where requester_email = v_person.email) then
    -- Kept only so past requests still say who made them; they can't sign in and have no card
    update public.people set initials = null, active = false, role = 'faculty' where email = v_person.email;
    return 'kept_history';
  end if;
  delete from public.people where email = v_person.email;
  return 'deleted';
end $$;


--
-- Name: admin_delete_person(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_person(p_email text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  v public.people;
begin
  select * into v from public.people where email = lower(btrim(coalesce(p_email, '')));
  if v.email is null then
    raise exception 'That person was already removed' using errcode = 'P0001';
  end if;
  if v.email = me.email then
    raise exception 'You cannot delete yourself' using errcode = 'P0001';
  end if;
  if v.initials is not null then
    return public.admin_delete_faculty(v.initials);
  end if;
  delete from public.faculty_subjects where email = v.email;
  update public.requests set status = 'withdrawn', decided_at = now(), decided_by = me.email
   where requester_email = v.email and status = 'pending';
  if exists (select 1 from public.requests where requester_email = v.email) then
    update public.people set active = false, role = 'faculty' where email = v.email;
    return 'kept_history';
  end if;
  delete from public.people where email = v.email;
  return 'deleted';
end $$;


--
-- Name: admin_delete_record(text, date, integer[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_record(p_room text, p_date date, p_slots integer[], p_reason text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_delete_room(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_room(p_room text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare me public.people := public.require_admin();
begin
  if not exists (select 1 from public.rooms where id = p_room) then
    raise exception 'No such room' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.timetable_entries where room_id = p_room)
     or exists (select 1 from public.timetable_changes where room_id = p_room) then
    raise exception 'Room % has classes in the timetable (now or in the past), so deleting it would change old records. Clear its classes instead.', p_room
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.requests where room_id = p_room)
     or exists (select 1 from public.allotments where room_id = p_room) then
    raise exception 'Room % has requests or bookings on record, so it can''t be deleted without losing history.', p_room
      using errcode = 'P0001';
  end if;
  delete from public.rooms where id = p_room;
end $$;


--
-- Name: admin_edit_booking(text, date, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_edit_booking(p_room text, p_date date, p_slot integer, p_title text, p_reason text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  cur public.allotments;
  v_pos int;
  v_n int := 0;
  r record;
begin
  p_title := btrim(coalesce(p_title, ''));
  p_reason := btrim(coalesce(p_reason, ''));
  if length(p_title) = 0 or length(p_title) > 80 then
    raise exception 'The name must be 1 to 80 characters' using errcode = 'P0001';
  end if;
  if length(p_reason) < 5 or length(p_reason) > 500 then
    raise exception 'The description must be 5 to 500 characters' using errcode = 'P0001';
  end if;
  select * into cur from public.allotments
   where room_id = p_room and date = p_date and slot_id = p_slot order by id desc limit 1;
  if cur.id is null or cur.kind not in ('class_request', 'event_request', 'cie', 'event') then
    raise exception 'Only a booked class, event or CIE can be edited' using errcode = 'P0001';
  end if;
  if public.slot_has_ended(p_date, p_slot) then
    raise exception 'This slot has ended' using errcode = 'P0001';
  end if;
  select pos into v_pos from (select id, row_number() over (order by starts) as pos from public.slots) s where s.id = p_slot;

  -- Walk out from the slot in both directions while the next slot holds the same booking.
  for r in
    with latest as (
      select distinct on (a.slot_id) a.*, s.pos
        from public.allotments a
        join (select id, row_number() over (order by starts) as pos from public.slots) s on s.id = a.slot_id
       where a.room_id = p_room and a.date = p_date
       order by a.slot_id, a.id desc
    ),
    same as (
      select l.*, l.pos - row_number() over (order by l.pos) as run
        from latest l
       where l.kind = cur.kind and l.title = cur.title and l.reason = cur.reason
         and l.faculty_email is not distinct from cur.faculty_email
         and not public.slot_has_ended(p_date, l.slot_id)
    )
    select * from same where run = (select run from same where pos = v_pos)
  loop
    insert into public.allotments (room_id, date, slot_id, kind, title, faculty_email, faculty_name,
                                   reason, request_id, created_by)
    values (r.room_id, r.date, r.slot_id, r.kind, p_title, r.faculty_email, r.faculty_name,
            p_reason, r.request_id, me.email);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;


--
-- Name: admin_edit_record(text, date, integer[], text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_edit_record(p_room text, p_date date, p_slots integer[], p_title text, p_reason text, p_faculty text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
    select r.initials, r.name into v_ini, v_name from public.resolve_faculty(v_ini) r;
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


--
-- Name: admin_edit_timetable(text, integer, integer[], text, text[], boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_edit_timetable(p_room text, p_weekday integer, p_slots integer[], p_subject text, p_initials text[], p_is_department boolean DEFAULT false) RETURNS date
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_end_semester(text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_end_semester(p_semester text, p_last_day date) RETURNS date
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  me public.people := public.require_admin();
  v_sem text := btrim(coalesce(p_semester, ''));
  v_from date;
  d date;
begin
  if v_sem !~ '^\d$' then
    raise exception 'Pick a semester' using errcode = 'P0001';
  end if;
  if p_last_day is null then
    raise exception 'Pick the last day of classes' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.semester_ends where semester = v_sem) then
    raise exception 'Classes of semester % have already been ended. Undo that first to change the date.', v_sem using errcode = 'P0001';
  end if;
  -- Past days keep the timetable they had
  v_from := greatest(p_last_day + 1, public.ist_today());
  if (public.version_on(v_from)).id is null then
    raise exception 'There is no timetable after that day' using errcode = 'P0001';
  end if;

  insert into public.semester_ends (semester, last_day, created_by) values (v_sem, p_last_day, me.email);
  for d in select * from public.semester_change_days(v_from) loop
    perform public.semester_version(d, 'Semester ' || v_sem || ' classes ended on ' || to_char(p_last_day, 'DD/MM/YYYY') || ', by ' || me.email);
  end loop;
  return v_from;
end $_$;


--
-- Name: admin_free_slots(text, date, integer[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_free_slots(p_room text, p_date date, p_slots integer[], p_reason text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  v_slot int;
  d record;
  v_freed int := 0;
begin
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Please add a reason' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_slots, 1), 0) = 0 then
    raise exception 'Pick at least one slot' using errcode = 'P0001';
  end if;
  foreach v_slot in array p_slots loop
    if public.slot_has_ended(p_date, v_slot) then
      raise exception 'Past slots cannot be changed' using errcode = 'P0001';
    end if;
    select * into d from public.get_day_schedule(p_date) s where s.room_id = p_room and s.slot_id = v_slot;
    if d.status is null then
      raise exception 'Unknown room or slot' using errcode = 'P0001';
    end if;
    continue when d.status = 'free';
    insert into public.allotments (room_id, date, slot_id, kind, title, faculty_name, reason, created_by)
    values (p_room, p_date, v_slot, 'drop', coalesce(d.subject, 'Class'), d.faculty_name,
            'Removed by admin: ' || btrim(p_reason), me.email);
    v_freed := v_freed + 1;
  end loop;
  if v_freed = 0 then
    raise exception 'Those slots are already free' using errcode = 'P0001';
  end if;
  return v_freed;
end $$;


--
-- Name: admin_override(text, date, integer, public.allotment_kind, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_override(p_room text, p_date date, p_slot integer, p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  v_past boolean := public.slot_has_ended(p_date, p_slot);
  v_ini text := nullif(upper(btrim(coalesce(p_faculty, ''))), '');
  f record;
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

  if p_kind = 'class_request' and v_ini is not null then
    -- A class has one faculty member
    if v_ini ~ '[,@]' then
      raise exception 'A class can have one faculty member' using errcode = 'P0001';
    end if;
    select * into f from public.resolve_faculty(v_ini);
    v_ini := f.initials;
    v_name := f.name;
    select email into v_email from public.people where initials = v_ini and active limit 1;
  elsif p_kind = 'class_request' then
    v_ini := null;
  elsif v_ini is not null then
    -- An event's, CIE's or SEE's faculty in charge (optional): one or more, a cluster or the whole department
    select * into f from public.resolve_faculty(v_ini);
    v_ini := f.initials;
    v_name := f.name;
    v_email := me.email;  -- stays the allotting admin's, with its faculty named
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


--
-- Name: admin_override_many(jsonb, public.allotment_kind, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_override_many(p_places jsonb, p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_override_slots(text, date, integer[], public.allotment_kind, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_override_slots(p_room text, p_date date, p_slots integer[], p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_remove_faculty(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_remove_faculty(p_initials text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare me public.people := public.require_admin();
begin
  delete from public.faculty_directory where initials = upper(btrim(coalesce(p_initials, '')));
end $$;


--
-- Name: admin_remove_holiday(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_remove_holiday(p_date date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.require_admin();
  delete from public.holidays where date = p_date;
end $$;


--
-- Name: admin_remove_leave(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_remove_leave(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare me public.people := public.require_admin();
begin
  delete from public.faculty_leave where id = p_id;
  if not found then
    raise exception 'That leave was already removed' using errcode = 'P0001';
  end if;
end $$;


--
-- Name: admin_remove_notice(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_remove_notice(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.require_admin();
  delete from public.notices where id = p_id;
end $$;


--
-- Name: admin_remove_subject(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_remove_subject(p_email text, p_subject text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.require_admin();
  delete from public.faculty_subjects where email = p_email and subject = p_subject;
end $$;


--
-- Name: admin_rename_booking(text, date, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_rename_booking(p_room text, p_date date, p_slot integer, p_title text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  cur public.allotments;
  v_pos int;
  v_n int := 0;
  r record;
begin
  p_title := btrim(coalesce(p_title, ''));
  if length(p_title) = 0 or length(p_title) > 80 then
    raise exception 'The name must be 1 to 80 characters' using errcode = 'P0001';
  end if;
  select * into cur from public.allotments
   where room_id = p_room and date = p_date and slot_id = p_slot order by id desc limit 1;
  if cur.id is null or cur.kind not in ('class_request', 'event_request', 'cie', 'event') then
    raise exception 'Only a booked class, event or CIE can be renamed' using errcode = 'P0001';
  end if;
  select pos into v_pos from (select id, row_number() over (order by starts) as pos from public.slots) s where s.id = p_slot;

  -- Walk out from the slot in both directions while the next slot holds the same booking.
  for r in
    with latest as (
      select distinct on (a.slot_id) a.*, s.pos
        from public.allotments a
        join (select id, row_number() over (order by starts) as pos from public.slots) s on s.id = a.slot_id
       where a.room_id = p_room and a.date = p_date
       order by a.slot_id, a.id desc
    ),
    same as (
      select l.*, l.pos - row_number() over (order by l.pos) as run
        from latest l
       where l.kind = cur.kind and l.title = cur.title and l.reason = cur.reason
         and l.faculty_email is not distinct from cur.faculty_email
         and not public.slot_has_ended(p_date, l.slot_id)
    )
    select * from same where run = (select run from same where pos = v_pos)
  loop
    insert into public.allotments (room_id, date, slot_id, kind, title, faculty_email, faculty_name,
                                   reason, request_id, created_by)
    values (r.room_id, r.date, r.slot_id, r.kind, p_title, r.faculty_email, r.faculty_name,
            r.reason, r.request_id, me.email);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;


--
-- Name: admin_rename_room(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_rename_room(p_room text, p_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare me public.people := public.require_admin();
begin
  if length(btrim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception 'A room name is 1 to 40 characters' using errcode = 'P0001';
  end if;
  update public.rooms set name = btrim(p_name) where id = p_room;
  if not found then
    raise exception 'No such room' using errcode = 'P0001';
  end if;
end $$;


--
-- Name: admin_rename_subject(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_rename_subject(p_email text, p_old text, p_new text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  v_new text := upper(btrim(coalesce(p_new, '')));
begin
  if length(v_new) not between 1 and 40 then
    raise exception 'A subject is 1 to 40 characters' using errcode = 'P0001';
  end if;
  if v_new <> p_old and exists (select 1 from public.faculty_subjects where email = p_email and subject = v_new) then
    raise exception 'They already have %', v_new using errcode = 'P0001';
  end if;
  update public.faculty_subjects set subject = v_new, source = 'admin' where email = p_email and subject = p_old;
  if not found then
    raise exception 'That subject was removed' using errcode = 'P0001';
  end if;
end $$;


--
-- Name: admin_replace_faculty_duties(text[], jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_replace_faculty_duties(p_initials text[], p_entries jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  v_count int;
begin
  if coalesce(array_length(p_initials, 1), 0) = 0 then
    raise exception 'The file has no faculty timetables' using errcode = 'P0001';
  end if;
  delete from public.faculty_duties where initials = any (select upper(btrim(i)) from unnest(p_initials) i);
  insert into public.faculty_duties (initials, weekday, slot_id, activity, updated_by)
  select distinct on (upper(btrim(e.initials)), e.weekday, e.slot_id)
         upper(btrim(e.initials)), e.weekday, e.slot_id, left(regexp_replace(btrim(e.activity), '\s+', ' ', 'g'), 60), me.email
    from jsonb_to_recordset(p_entries) as e(initials text, weekday int, slot_id int, activity text)
   where upper(btrim(e.initials)) = any (select upper(btrim(i)) from unnest(p_initials) i)
     and e.weekday between 1 and 6
     and exists (select 1 from public.slots s where s.id = e.slot_id)
     and btrim(coalesce(e.activity, '')) <> '';
  get diagnostics v_count = row_count;
  return v_count;
end $$;


--
-- Name: admin_replace_timetable(text[], jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_replace_timetable(p_rooms text[], p_entries jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_restore(text, date, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_restore(p_room text, p_date date, p_slot integer, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare me public.people := public.require_admin();
begin
  if not exists (select 1 from public.allotments where room_id = p_room and date = p_date and slot_id = p_slot) then
    raise exception 'Nothing to restore for this slot' using errcode = 'P0001';
  end if;
  insert into public.allotments (room_id, date, slot_id, kind, reason, faculty_email, faculty_name, created_by)
  values (p_room, p_date, p_slot, 'restore', coalesce(nullif(btrim(p_reason), ''), 'Restored to timetable'),
          me.email, public.display_name(me), me.email);
end $$;


--
-- Name: admin_rollover(boolean, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_rollover(p_duties boolean, p_subjects text, p_leave boolean) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  n_duties int := 0;
  n_subjects int := 0;
  n_leave int := 0;
begin
  if p_duties then
    delete from public.faculty_duties;
    get diagnostics n_duties = row_count;
  end if;
  if p_subjects = 'timetable' then
    delete from public.faculty_subjects where source = 'timetable';
    get diagnostics n_subjects = row_count;
  elsif p_subjects = 'all' then
    delete from public.faculty_subjects;
    get diagnostics n_subjects = row_count;
  end if;
  if p_leave then
    delete from public.faculty_leave where ends_on < public.ist_today();
    get diagnostics n_leave = row_count;
  end if;
  return format('%s duty slots, %s subjects and %s past leave cleared', n_duties, n_subjects, n_leave);
end $$;


--
-- Name: admin_rooms_in_use(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_rooms_in_use() RETURNS SETOF text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET jit TO 'off'
    AS $$
  select r.id from public.rooms r
  where public.is_admin() and (
    exists (select 1 from public.timetable_entries t where t.room_id = r.id)
    or exists (select 1 from public.timetable_changes c where c.room_id = r.id)
    or exists (select 1 from public.requests q where q.room_id = r.id)
    or exists (select 1 from public.allotments a where a.room_id = r.id))
$$;


--
-- Name: admin_save_equipment(integer, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_save_equipment(p_id integer, p_name text, p_notes text, p_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare me public.people := public.require_admin();
begin
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Name the equipment, e.g. Portable projector 1' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.equipment (name, notes) values (btrim(p_name), btrim(coalesce(p_notes, '')));
  else
    update public.equipment set name = btrim(p_name), notes = btrim(coalesce(p_notes, '')), active = coalesce(p_active, true) where id = p_id;
    if not found then
      raise exception 'No such equipment' using errcode = 'P0001';
    end if;
    -- Retiring an item cancels its future bookings
    if not coalesce(p_active, true) then
      update public.equipment_bookings set cancelled_at = now(), cancelled_by = me.email
       where equipment_id = p_id and cancelled_at is null and not public.slot_has_ended(date, slot_id);
    end if;
  end if;
exception when unique_violation then
  raise exception 'There is already equipment called %', btrim(p_name) using errcode = 'P0001';
end $$;


--
-- Name: admin_save_faculty(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_save_faculty(p_old_initials text, p_initials text, p_title text, p_full_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
end $_$;


--
-- Name: admin_save_supply(integer, text, text, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_save_supply(p_id integer, p_name text, p_unit text, p_stock integer, p_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare me public.people := public.require_admin();
begin
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Name the item, e.g. Whiteboard markers' using errcode = 'P0001';
  end if;
  if p_stock is null or p_stock < 0 then
    raise exception 'Stock can''t be below zero' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.supplies (name, unit, stock, active)
    values (btrim(p_name), coalesce(nullif(btrim(p_unit), ''), 'pcs'), p_stock, coalesce(p_active, true));
  else
    update public.supplies set name = btrim(p_name), unit = coalesce(nullif(btrim(p_unit), ''), 'pcs'), stock = p_stock,
           active = coalesce(p_active, true), updated_at = now()
     where id = p_id;
    if not found then
      raise exception 'That item was removed' using errcode = 'P0001';
    end if;
  end if;
exception when unique_violation then
  raise exception 'There is already an item called %', btrim(p_name) using errcode = 'P0001';
end $$;


--
-- Name: admin_set_day_order(date, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_day_order(p_date date, p_follows integer, p_note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare me public.people := public.require_admin();
begin
  if p_date is null then
    raise exception 'Pick a date' using errcode = 'P0001';
  end if;
  if p_date < public.ist_today()
     and not exists (select 1 from public.timetable_versions where p_date between valid_from and valid_to) then
    raise exception 'That date is outside every semester' using errcode = 'P0001';
  end if;
  if p_follows is null or p_follows = extract(isodow from p_date) then
    delete from public.day_orders where date = p_date;
    return;
  end if;
  if p_follows not between 1 and 6 then
    raise exception 'Pick a weekday from Monday to Saturday' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.holidays where date = p_date) then
    raise exception 'That day is a holiday. Remove the holiday first, or pick another day.' using errcode = 'P0001';
  end if;
  insert into public.day_orders (date, follows, note, created_by) values (p_date, p_follows, btrim(coalesce(p_note, '')), me.email)
  on conflict (date) do update set follows = excluded.follows, note = excluded.note, created_by = excluded.created_by, created_at = now();
end $$;


--
-- Name: admin_set_faculty_clusters(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_faculty_clusters(p_entries jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  v_count int := 0;
  v_n int;
begin
  drop table if exists pg_temp.cluster_incoming;
  create temp table cluster_incoming on commit drop as
  select distinct on (upper(btrim(e.initials))) upper(btrim(e.initials)) as initials, nullif(upper(btrim(coalesce(e.cluster, ''))), '') as cluster
    from jsonb_to_recordset(p_entries) as e(initials text, cluster text)
   where btrim(coalesce(e.initials, '')) <> '';
  if exists (select 1 from cluster_incoming where cluster is not null and cluster not in ('A', 'B')) then
    raise exception 'A cluster must be A or B' using errcode = 'P0001';
  end if;

  delete from public.faculty_clusters c using cluster_incoming i where c.initials = i.initials and i.cluster is null;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;
  insert into public.faculty_clusters (initials, cluster, updated_by)
  select initials, cluster, me.email from cluster_incoming where cluster is not null
  on conflict (initials) do update set cluster = excluded.cluster, updated_by = excluded.updated_by, updated_at = now()
   where faculty_clusters.cluster is distinct from excluded.cluster;
  get diagnostics v_n = row_count;
  return v_count + v_n;
end $$;


--
-- Name: admin_set_faculty_duty(text, integer, integer[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_faculty_duty(p_initials text, p_weekday integer, p_slots integer[], p_activity text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  v_initials text := upper(btrim(coalesce(p_initials, '')));
  v_activity text := regexp_replace(btrim(coalesce(p_activity, '')), '\s+', ' ', 'g');
begin
  if v_initials = '' then
    raise exception 'Pick a faculty member' using errcode = 'P0001';
  end if;
  if p_weekday not between 1 and 6 then
    raise exception 'Pick a day from Monday to Saturday' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_slots, 1), 0) = 0 then
    raise exception 'Pick at least one slot' using errcode = 'P0001';
  end if;
  if length(v_activity) > 60 then
    raise exception 'Keep the duty under 60 characters' using errcode = 'P0001';
  end if;
  delete from public.faculty_duties where initials = v_initials and weekday = p_weekday and slot_id = any (p_slots);
  if v_activity <> '' then
    insert into public.faculty_duties (initials, weekday, slot_id, activity, updated_by)
    select v_initials, p_weekday, s.id, v_activity, me.email from public.slots s where s.id = any (p_slots);
  end if;
end $$;


--
-- Name: admin_subjects_from_timetable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_subjects_from_timetable() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  v_added int;
begin
  insert into public.faculty_subjects (email, subject, source, created_by)
  select distinct p.email, ts.subject, 'timetable', me.email
    from public.timetable_subjects() ts
    join public.people p on p.initials = ts.initials
  on conflict (email, subject) do nothing;
  get diagnostics v_added = row_count;
  return v_added;
end $$;


--
-- Name: admin_undo_decision(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_undo_decision(p_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  v_group uuid;
  r public.requests;
  v_status public.request_status;
  v_at timestamptz;
  v_prev public.allotment_kind;
begin
  select group_id, status, decided_at into v_group, v_status, v_at from public.requests where id = p_id or group_id = p_id limit 1;
  if v_group is null then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;
  if v_status not in ('approved', 'rejected') then
    raise exception 'Only an approved or rejected request can be undone' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.requests where group_id = v_group and public.slot_has_ended(date, slot_id)) then
    raise exception 'That slot has already ended' using errcode = 'P0001';
  end if;
  perform set_config('app.undo_decision', 'on', true);
  if v_status = 'approved' then
    for r in select * from public.requests where group_id = v_group loop
      -- Only if the booking is still the latest change to the slot
      if (select a.request_id from public.allotments a where a.room_id = r.room_id and a.date = r.date and a.slot_id = r.slot_id order by a.id desc limit 1) is distinct from r.id then
        raise exception 'The slot was changed after the approval, so it can''t be undone here' using errcode = 'P0001';
      end if;
      -- Give the slot back as it was: still dropped if a class had been dropped to free it
      select a.kind into v_prev from public.allotments a
       where a.room_id = r.room_id and a.date = r.date and a.slot_id = r.slot_id
       order by a.id desc offset 1 limit 1;
      insert into public.allotments (room_id, date, slot_id, kind, reason, faculty_email, faculty_name, created_by)
      values (r.room_id, r.date, r.slot_id,
              case when v_prev = 'drop' then 'drop' else 'restore' end::public.allotment_kind,
              'Approval undone', me.email, public.display_name(me), me.email);
      update public.requests set status = 'pending', decided_by = null, decided_at = null, decision_note = null
       where room_id = r.room_id and date = r.date and slot_id = r.slot_id and status = 'rejected'
         and decided_at = v_at and decision_note = 'Another request was approved for this slot';
    end loop;
  end if;
  update public.requests set status = 'pending', decided_by = null, decided_at = null, decision_note = null where group_id = v_group;
  perform set_config('app.undo_decision', 'off', true);
  return v_status::text;
end $$;


--
-- Name: admin_undo_exchange(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_undo_exchange(p_id bigint, p_note text DEFAULT ''::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  x public.class_exchanges;
  v_slot int;
  v_last public.allotments;
  v_prev public.allotments;
begin
  select * into x from public.class_exchanges where id = p_id for update;
  if x.id is null or x.status <> 'approved' then
    raise exception 'Only an approved exchange can be taken back' using errcode = 'P0001';
  end if;
  if public.slot_has_started(x.date, x.slot_id) then
    raise exception 'This class has already started' using errcode = 'P0001';
  end if;
  foreach v_slot in array public.exchange_slots(x) loop
    select * into v_last from public.allotments a
     where a.room_id = x.room_id and a.date = x.date and a.slot_id = v_slot
     order by a.id desc limit 1;
    if v_last.id is null or v_last.kind <> 'class_request' or v_last.request_id is not null
       or v_last.reason not like 'Class exchange:%' then
      raise exception 'The slot was changed after the approval, so it can''t be taken back here' using errcode = 'P0001';
    end if;
  end loop;
  foreach v_slot in array public.exchange_slots(x) loop
    select * into v_last from public.allotments a
     where a.room_id = x.room_id and a.date = x.date and a.slot_id = v_slot
     order by a.id desc limit 1;
    select * into v_prev from public.allotments a
     where a.room_id = x.room_id and a.date = x.date and a.slot_id = v_slot and a.id < v_last.id
     order by a.id desc limit 1;
    if v_prev.id is not null and v_prev.kind in ('class_request', 'event_request') then
      -- The requester's own booking: put a copy of it back
      insert into public.allotments (room_id, date, slot_id, kind, title, faculty_email, faculty_name, faculty_initials, reason, request_id, created_by)
      values (v_prev.room_id, v_prev.date, v_prev.slot_id, v_prev.kind, v_prev.title, v_prev.faculty_email, v_prev.faculty_name,
              v_prev.faculty_initials, v_prev.reason, v_prev.request_id, me.email);
    else
      insert into public.allotments (room_id, date, slot_id, kind, reason, faculty_email, faculty_name, created_by)
      values (x.room_id, x.date, v_slot, 'restore', 'Class exchange approval taken back', me.email, public.display_name(me), me.email);
    end if;
  end loop;
  update public.class_exchanges
     set status = 'rejected',
         decided_by = me.email,
         decision_note = coalesce(nullif(left(btrim(coalesce(p_note, '')), 300), ''), 'Approval taken back; the original class stays'),
         decided_at = now()
   where id = p_id;
end $$;


--
-- Name: admin_undo_semester_end(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_undo_semester_end(p_semester text) RETURNS date
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  r public.semester_ends;
  v_from date;
  v_base int;
  d date;
begin
  select * into r from public.semester_ends where semester = btrim(coalesce(p_semester, ''));
  if r.semester is null then
    raise exception 'That semester''s classes have not been ended' using errcode = 'P0001';
  end if;
  v_from := greatest(r.last_day + 1, public.ist_today());
  -- The timetable on the semester's last day still has its classes
  v_base := (public.version_on(r.last_day)).id;
  delete from public.semester_ends where semester = r.semester;
  for d in select * from public.semester_change_days(v_from) loop
    perform public.semester_version(d, 'Semester ' || r.semester || ' classes brought back, by ' || me.email, r.semester, v_base);
  end loop;
  return v_from;
end $$;


--
-- Name: admin_update_holiday(date, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_holiday(p_date date, p_new_date date, p_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare me public.people := public.require_admin();
begin
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Name the holiday' using errcode = 'P0001';
  end if;
  if extract(isodow from p_new_date) = 7 then
    raise exception 'That date is a Sunday' using errcode = 'P0001';
  end if;
  if p_new_date <> p_date and exists (select 1 from public.holidays where date = p_new_date) then
    raise exception 'There is already a holiday on that date' using errcode = 'P0001';
  end if;
  update public.holidays set date = p_new_date, name = btrim(p_name) where date = p_date;
  if not found then
    raise exception 'That holiday was removed' using errcode = 'P0001';
  end if;
end $$;


--
-- Name: admin_update_leave(bigint, date, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_leave(p_id bigint, p_from date, p_to date, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  v_ini text;
  v_to date := coalesce(p_to, p_from);
begin
  select initials into v_ini from public.faculty_leave where id = p_id;
  if v_ini is null then
    raise exception 'That leave was removed' using errcode = 'P0001';
  end if;
  if p_from is null or v_to < p_from then
    raise exception 'The leave must end on or after the day it starts' using errcode = 'P0001';
  end if;
  if v_to - p_from > 90 then
    raise exception 'Leave can be at most 90 days at a time' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.faculty_leave where initials = v_ini and id <> p_id and starts_on <= v_to and ends_on >= p_from) then
    raise exception '% is already on leave on some of those days', v_ini using errcode = 'P0001';
  end if;
  update public.faculty_leave set starts_on = p_from, ends_on = v_to, reason = btrim(coalesce(p_reason, '')) where id = p_id;
end $$;


--
-- Name: admin_update_notice(bigint, text, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_notice(p_id bigint, p_message text, p_starts date, p_ends date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare me public.people := public.require_admin();
begin
  if p_ends < p_starts then
    raise exception 'The notice must end on or after the day it starts' using errcode = 'P0001';
  end if;
  update public.notices set message = btrim(p_message), starts_on = p_starts, ends_on = p_ends where id = p_id;
  if not found then
    raise exception 'That notice was removed' using errcode = 'P0001';
  end if;
end $$;


--
-- Name: admin_update_room(text, integer, text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_room(p_room text, p_capacity integer, p_kind text, p_projector boolean, p_notes text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.require_admin();
  update public.rooms
     set capacity = p_capacity, kind = p_kind, projector = coalesce(p_projector, false), notes = btrim(coalesce(p_notes, ''))
   where id = p_room;
  if not found then
    raise exception 'No such room' using errcode = 'P0001';
  end if;
end $$;


--
-- Name: admin_upsert_person(text, text, text, text, public.app_role, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_upsert_person(p_email text, p_full_name text, p_initials text, p_title text, p_role public.app_role, p_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare me public.people := public.require_admin();
begin
  if lower(btrim(p_email)) = me.email and (p_role <> 'admin' or not p_active) then
    raise exception 'You cannot remove your own admin access' using errcode = 'P0001';
  end if;
  insert into public.people (email, full_name, initials, title, role, active)
  values (lower(btrim(p_email)), btrim(p_full_name), nullif(upper(btrim(p_initials)), ''),
          nullif(btrim(p_title), ''), p_role, p_active)
  on conflict (email) do update
    set full_name = excluded.full_name, initials = excluded.initials, title = excluded.title,
        role = excluded.role, active = excluded.active;
end $$;


--
-- Name: allotments_cie_coordinators(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.allotments_cie_coordinators() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.kind = 'cie' and new.faculty_initials is null then
    new.faculty_name := case when coalesce(new.title, '') ~* '^\s*SEE\M' then 'SEE Co-ordinators' else 'CIE Co-ordinators' end;
  end if;
  return new;
end $$;


--
-- Name: allotments_fill_initials(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.allotments_fill_initials() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: allotments_guard_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.allotments_guard_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: approve_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_request(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  v_group uuid;
  r public.requests;
begin
  select group_id into v_group from public.requests where id = p_id or group_id = p_id limit 1;
  if v_group is null then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;
  perform 1 from public.requests where group_id = v_group for update;
  if exists (select 1 from public.requests where group_id = v_group and status <> 'pending') then
    raise exception 'This request has already been decided' using errcode = 'P0001';
  end if;
  for r in select * from public.requests where group_id = v_group order by slot_id loop
    if (select status from public.slot_state(r.room_id, r.date, r.slot_id)) is distinct from 'free' then
      raise exception 'Slot % is no longer free', (select label from public.slots where id = r.slot_id)
        using errcode = 'P0001';
    end if;
  end loop;
  update public.requests set status = 'approved', decided_by = me.email, decided_at = now()
   where group_id = v_group;
  for r in select * from public.requests where group_id = v_group order by slot_id loop
    insert into public.allotments (room_id, date, slot_id, kind, title, faculty_email, faculty_name,
                                   reason, request_id, created_by)
    values (r.room_id, r.date, r.slot_id,
            case r.type when 'class' then 'class_request' else 'event_request' end::public.allotment_kind,
            case r.type when 'class' then coalesce(r.subject, 'Class') else 'Event' end,
            r.requester_email, r.requester_name, r.description, r.id, me.email);
    perform public.reject_others(r.room_id, r.date, r.slot_id, v_group,
                                 'Another request was approved for this slot', me.email);
  end loop;
end $$;


--
-- Name: book_equipment(integer, date, integer[], text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.book_equipment(p_equipment integer, p_date date, p_slots integer[], p_room text, p_purpose text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.current_person();
  v_slot int;
  v_taken text;
begin
  if me.email is null or not me.active then
    raise exception 'Only registered faculty can book equipment' using errcode = '42501';
  end if;
  if not exists (select 1 from public.equipment where id = p_equipment and active) then
    raise exception 'That equipment can''t be booked' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_slots, 1), 0) = 0 then
    raise exception 'Pick at least one slot' using errcode = 'P0001';
  end if;
  if p_date > public.ist_today() + 28 then
    raise exception 'Equipment can be booked up to four weeks ahead' using errcode = 'P0001';
  end if;
  foreach v_slot in array p_slots loop
    if public.slot_has_ended(p_date, v_slot) then
      raise exception 'That slot has already ended' using errcode = 'P0001';
    end if;
    select booked_name into v_taken from public.equipment_bookings
     where equipment_id = p_equipment and date = p_date and slot_id = v_slot and cancelled_at is null;
    if v_taken is not null then
      raise exception 'Already booked by % in one of those slots', v_taken using errcode = 'P0001';
    end if;
    insert into public.equipment_bookings (equipment_id, date, slot_id, room_id, purpose, booked_by, booked_name)
    values (p_equipment, p_date, v_slot, nullif(p_room, ''), btrim(coalesce(p_purpose, '')), me.email, public.display_name(me));
  end loop;
end $$;


--
-- Name: booking_window_check(date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.booking_window_check(p_date date, p_slot integer) RETURNS void
    LANGUAGE plpgsql STABLE
    AS $$
begin
  if not public.is_working_day(p_date) then
    raise exception 'Rooms cannot be booked on Sundays' using errcode = 'P0001';
  end if;
  if public.slot_has_ended(p_date, p_slot) then
    raise exception 'This slot has already ended' using errcode = 'P0001';
  end if;
  if p_date > public.ist_today() + 28 then
    raise exception 'Bookings open at most 4 weeks ahead' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.timetable_versions where p_date between valid_from and valid_to) then
    raise exception 'This date is outside the current semester' using errcode = 'P0001';
  end if;
end $$;


--
-- Name: calendar_feed(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calendar_feed(p_token text) RETURNS TABLE(date date, room_id text, room_name text, slot_id smallint, starts time without time zone, ends time without time zone, status text, subject text, faculty_name text, reason text, owner text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET jit TO 'off'
    AS $$
declare
  v_email text;
  v_name text;
begin
  select f.email, public.display_name(p) into v_email, v_name
    from public.calendar_feeds f join public.people p on p.email = f.email and p.active
   where f.token = p_token and length(p_token) >= 32;
  if v_email is null then
    return;
  end if;
  -- get_day_schedule marks "mine" from the request's email: answer as the feed's owner
  perform set_config('request.jwt.claims', json_build_object('email', v_email)::text, true);
  return query
    select d::date, s.room_id, s.room_name, s.slot_id, s.starts, s.ends, s.status, s.subject, s.faculty_name, s.reason, v_name
    from generate_series(public.ist_today() - 7, public.ist_today() + 28, interval '1 day') d
    cross join lateral public.get_day_schedule(d::date) s
    where s.is_mine
    order by 1, s.starts, s.room_id;
end $$;


--
-- Name: cancel_equipment(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_equipment(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare b public.equipment_bookings;
begin
  select * into b from public.equipment_bookings where id = p_id and cancelled_at is null;
  if b.id is null then
    raise exception 'That booking was already cancelled' using errcode = 'P0001';
  end if;
  if b.booked_by <> public.current_email() and not public.is_admin() then
    raise exception 'You can only cancel your own bookings' using errcode = '42501';
  end if;
  update public.equipment_bookings set cancelled_at = now(), cancelled_by = public.current_email()
   where equipment_id = b.equipment_id and date = b.date and booked_by = b.booked_by
     and created_at = b.created_at and cancelled_at is null and not public.slot_has_ended(date, slot_id);
end $$;


--
-- Name: cancel_resource_request(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_resource_request(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.resource_requests set status = 'cancelled', decided_at = now(), decided_by = public.current_email()
   where id = p_id and status = 'pending' and requester_email = public.current_email();
  if not found then
    raise exception 'That request was already decided or withdrawn' using errcode = 'P0001';
  end if;
end $$;


--
-- Name: consecutive_slots(integer[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consecutive_slots(p_slots integer[]) RETURNS integer[]
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with ordered as (select id, row_number() over (order by starts) as n from public.slots),
       picked as (select distinct o.id, o.n from ordered o where o.id = any (p_slots))
  select case
           when count(*) = coalesce(array_length(p_slots, 1), 0)
                and count(*) > 0
                and max(n) - min(n) + 1 = count(*)
           then array_agg(id order by n)
         end
  from picked
$$;


--
-- Name: create_group_request(text, date, integer[], public.request_type, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_group_request(p_room text, p_date date, p_slots integer[], p_type public.request_type, p_description text, p_pdf_path text DEFAULT NULL::text, p_subject text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people;
  v_size bigint;
  v_group uuid := gen_random_uuid();
  v_slot int;
  v_n int;
  v_span int;
  v_priority int;
begin
  me := public.current_person();
  if me.email is null then
    raise exception 'Only registered faculty can request rooms' using errcode = '42501';
  end if;
  v_n := coalesce(array_length(p_slots, 1), 0);
  if v_n = 0 then
    raise exception 'Pick at least one slot' using errcode = 'P0001';
  end if;
  -- Slots must be distinct and next to each other in the day's order (breaks don't count as gaps).
  select count(distinct s.id), max(s.pos) - min(s.pos) + 1 into v_n, v_span
    from (select id, row_number() over (order by starts) as pos from public.slots) s
   where s.id = any (p_slots);
  if v_n <> array_length(p_slots, 1) or v_span <> v_n then
    raise exception 'The slots in one request must be consecutive' using errcode = 'P0001';
  end if;
  foreach v_slot in array p_slots loop
    perform public.booking_window_check(p_date, v_slot);
    if (select status from public.slot_state(p_room, p_date, v_slot)) is distinct from 'free' then
      raise exception 'Only free slots can be requested' using errcode = 'P0001';
    end if;
  end loop;
  if exists (select 1 from public.requests
              where room_id = p_room and date = p_date and slot_id = any (p_slots)
                and requester_email = me.email and status = 'pending') then
    raise exception 'You already have a pending request for one of these slots' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_description, ''))) < 5 then
    raise exception 'Please add a description' using errcode = 'P0001';
  end if;
  if p_type = 'class' then
    if not exists (select 1 from public.faculty_subjects where email = me.email) then
      raise exception 'No subjects are allotted to you yet. Ask an admin to add your subjects.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.faculty_subjects where email = me.email and subject = p_subject) then
      raise exception 'Pick one of your subjects for the class' using errcode = 'P0001';
    end if;
  else
    p_subject := null;
  end if;
  -- The approval letter is optional; the admin can reject an event request sent without one.
  if p_type = 'event' and p_pdf_path is not null then
    if split_part(p_pdf_path, '/', 1) <> me.email then
      raise exception 'The approval letter must be uploaded from your own account' using errcode = 'P0001';
    end if;
    select (o.metadata ->> 'size')::bigint into v_size
      from storage.objects o where o.bucket_id = 'letters' and o.name = p_pdf_path;
    if v_size is null then
      raise exception 'The approval letter was not uploaded' using errcode = 'P0001';
    end if;
    if v_size > 5 * 1024 * 1024 then
      raise exception 'The approval letter must be under 5 MB' using errcode = 'P0001';
    end if;
  else
    p_pdf_path := null;
  end if;

  select coalesce(max(priority) + 1, 0) into v_priority
    from public.requests where room_id = p_room and date = p_date and status = 'pending';

  insert into public.requests (room_id, date, slot_id, requester_email, requester_name,
                               type, description, pdf_path, priority, group_id, subject)
  select p_room, p_date, s, me.email, public.display_name(me), p_type, btrim(p_description),
         p_pdf_path, v_priority, v_group, p_subject
    from unnest(p_slots) as s;
  return v_group;
end $$;


--
-- Name: create_request(text, date, integer, public.request_type, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_request(p_room text, p_date date, p_slot integer, p_type public.request_type, p_description text, p_pdf_path text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.create_group_request(p_room, p_date, array[p_slot], p_type, p_description, p_pdf_path)
$$;


--
-- Name: current_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_email() RETURNS text
    LANGUAGE sql STABLE
    AS $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: people; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.people (
    email text NOT NULL,
    full_name text NOT NULL,
    initials text,
    title text,
    role public.app_role DEFAULT 'faculty'::public.app_role NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT people_email_check CHECK (((email = lower(email)) AND (email ~~ '%@bmsce.ac.in'::text)))
);


--
-- Name: current_person(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_person() RETURNS public.people
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select * from public.people where email = public.current_email() and active
$$;


--
-- Name: day_order(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.day_order(p_date date) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select o.follows from public.day_orders o where o.date = p_date), extract(isodow from p_date)::int)
$$;


--
-- Name: display_name(public.people); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.display_name(p public.people) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select case when p.title is not null and p.full_name not ilike p.title || '%'
              then p.title || ' ' || p.full_name else p.full_name end
$$;


--
-- Name: drop_class(text, date, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.drop_class(p_room text, p_date date, p_slot integer, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people;
  st record;
begin
  me := public.current_person();
  if me.email is null then
    raise exception 'Only registered faculty can drop classes' using errcode = '42501';
  end if;
  if public.slot_has_ended(p_date, p_slot) then
    raise exception 'This slot has already ended' using errcode = 'P0001';
  end if;
  select * into st from public.slot_state(p_room, p_date, p_slot);
  if st.status not in ('class', 'booked') or not st.is_mine then
    raise exception 'You can only drop a class that is assigned to you' using errcode = 'P0001';
  end if;
  insert into public.allotments (room_id, date, slot_id, kind, reason, faculty_email, faculty_name, created_by)
  values (p_room, p_date, p_slot, 'drop', coalesce(nullif(btrim(p_reason), ''), 'No reason given'),
          me.email, public.display_name(me), me.email);
end $$;


--
-- Name: edit_equipment_booking(bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.edit_equipment_booking(p_id bigint, p_room text, p_purpose text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare b public.equipment_bookings;
begin
  select * into b from public.equipment_bookings where id = p_id and cancelled_at is null;
  if b.id is null then
    raise exception 'That booking was cancelled' using errcode = 'P0001';
  end if;
  if b.booked_by <> public.current_email() and not public.is_admin() then
    raise exception 'You can only change your own bookings' using errcode = '42501';
  end if;
  update public.equipment_bookings set room_id = nullif(p_room, ''), purpose = btrim(coalesce(p_purpose, ''))
   where equipment_id = b.equipment_id and date = b.date and booked_by = b.booked_by and created_at = b.created_at and cancelled_at is null;
end $$;


--
-- Name: edit_request(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.edit_request(p_id uuid, p_description text, p_subject text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.current_person();
  r public.requests;
  v_subject text := nullif(btrim(coalesce(p_subject, '')), '');
begin
  select * into r from public.requests where (id = p_id or group_id = p_id) and requester_email = me.email limit 1;
  if r.id is null then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;
  if r.status <> 'pending' then
    raise exception 'Only a pending request can be edited' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_description, ''))) < 5 then
    raise exception 'Please add a description of at least 5 characters' using errcode = 'P0001';
  end if;
  if r.type = 'class' and v_subject is not null and v_subject is distinct from r.subject
     and not exists (select 1 from public.faculty_subjects where email = me.email and subject = v_subject) then
    raise exception 'Pick one of your subjects' using errcode = 'P0001';
  end if;
  update public.requests
     set description = btrim(p_description), subject = case when r.type = 'class' then coalesce(v_subject, subject) else subject end
   where group_id = r.group_id and status = 'pending';
end $$;


--
-- Name: class_exchanges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_exchanges (
    id bigint NOT NULL,
    room_id text NOT NULL,
    date date NOT NULL,
    slot_id integer NOT NULL,
    subject text,
    new_subject text,
    requester_email text NOT NULL,
    requester_name text NOT NULL,
    requester_initials text,
    target_initials text NOT NULL,
    target_email text NOT NULL,
    target_name text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    response_note text,
    responded_at timestamp with time zone,
    decided_by text,
    decision_note text,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    slot_ids integer[],
    CONSTRAINT class_exchanges_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'approved'::text, 'rejected'::text, 'withdrawn'::text])))
);


--
-- Name: exchange_slots(public.class_exchanges); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.exchange_slots(x public.class_exchanges) RETURNS integer[]
    LANGUAGE sql IMMUTABLE
    AS $$
  select coalesce(x.slot_ids, array[x.slot_id])
$$;


--
-- Name: faculty_display(text[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.faculty_display(p_initials text[], p_label text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: faculty_free_at(text, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.faculty_free_at(p_initials text, p_date date, p_slot integer) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.faculty_status(p_date) f where f.initials = p_initials and f.slot_id = p_slot and not f.busy)
$$;


--
-- Name: faculty_status(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.faculty_status(p_date date) RETURNS TABLE(initials text, name text, cluster text, slot_id smallint, busy boolean, activity text, room_id text)
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
      and (l.kind is null or l.kind = 'restore')
  ),
  booked as (
    -- A booking's faculty, and every faculty member named for an event, CIE or SEE
    select ini, l.slot_id, l.title as activity, l.room_id
    from latest l left join public.people p on p.email = l.faculty_email
    cross join lateral unnest(string_to_array(
      case when l.kind in ('class_request', 'event_request') then coalesce(l.faculty_initials, p.initials) else l.faculty_initials end, ',')) as ini
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
  left join busy_by_slot b on b.ini = f.initials and b.slot_id = s.id
  where (select ok from open_day)
    and not public.slot_closed(p_date, s.id)
  order by s.starts, f.initials
$$;


--
-- Name: forbid_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.forbid_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'Records in % are permanent and cannot be changed or deleted', tg_table_name
    using errcode = 'P0001';
end $$;


--
-- Name: get_change_report(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_change_report(p_from date, p_to date) RETURNS TABLE(date date, slot_id integer, starts time without time zone, ends time without time zone, room_id text, kind public.allotment_kind, title text, faculty_name text, reason text, subject text, request_id uuid, original_faculty text)
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
  left join lateral public.regular_class(l.room_id, l.date, l.slot_id) o on true
  where l.kind <> 'restore' and public.is_admin()
  order by l.date, s.starts, l.room_id
$$;


--
-- Name: get_class_days(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_class_days(p_from date, p_to date) RETURNS TABLE(day date, timetable jsonb, schedule jsonb)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select d::date,
         coalesce((select jsonb_agg(to_jsonb(t)) from public.get_timetable(d::date) t), '[]'::jsonb),
         coalesce((select jsonb_agg(to_jsonb(s)) from public.get_day_schedule(d::date) s), '[]'::jsonb)
  from generate_series(p_from, least(p_to, p_from + 31), interval '1 day') d
  order by 1
$$;


--
-- Name: get_day_schedule(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_day_schedule(p_date date) RETURNS TABLE(room_id text, room_name text, slot_id smallint, slot_label text, starts time without time zone, ends time without time zone, status text, subject text, faculty_name text, reason text, is_mine boolean, ended boolean, original_subject text, original_faculty text)
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
  where public.is_working_day(p_date)
    and not r.archived
  order by s.starts, r.sort_order, r.id
$$;


--
-- Name: get_timetable(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_timetable(p_date date) RETURNS TABLE(room_id text, slot_id integer, subject text, faculty_initials text[], faculty_name text, is_department boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET jit TO 'off'
    AS $$
  select t.room_id, t.slot_id, t.subject, t.faculty_initials,
         public.faculty_display(t.faculty_initials, t.faculty_label), t.is_department
  from public.timetable_entries t
  where t.version_id = (select v.id from public.timetable_versions v
                         where p_date between v.valid_from and v.valid_to
                         order by v.valid_from desc, v.id desc limit 1)
    and t.weekday = public.day_order(p_date)
$$;


--
-- Name: get_timetable_all(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_timetable_all(p_date date) RETURNS TABLE(room_id text, weekday integer, slot_id integer, subject text, faculty_initials text[], faculty_label text, is_department boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET jit TO 'off'
    AS $$
  select t.room_id, t.weekday, t.slot_id, t.subject, t.faculty_initials, t.faculty_label, t.is_department
  from public.timetable_entries t
  where t.version_id = (select v.id from public.timetable_versions v
                         where p_date between v.valid_from and v.valid_to
                         order by v.valid_from desc, v.id desc limit 1)
$$;


--
-- Name: holidays_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.holidays_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if old.date <= public.ist_today() then
    raise exception 'Past holidays cannot be changed' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if new.date <= public.ist_today() then
      raise exception 'Move the holiday to tomorrow or later' using errcode = 'P0001';
    end if;
    return new;
  end if;
  return old;
end $$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.people
                 where email = public.current_email() and active and role = 'admin')
$$;


--
-- Name: is_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.people where email = public.current_email() and active)
$$;


--
-- Name: is_working_day(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_working_day(p_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select extract(isodow from p_date) between 1 and 6
      or exists (select 1 from public.day_orders o where o.date = p_date)
$$;


--
-- Name: ist_now(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ist_now() RETURNS timestamp without time zone
    LANGUAGE sql STABLE
    AS $$ select (now() at time zone 'Asia/Kolkata') $$;


--
-- Name: ist_today(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ist_today() RETURNS date
    LANGUAGE sql STABLE
    AS $$ select (now() at time zone 'Asia/Kolkata')::date $$;


--
-- Name: log_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_activity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- A request moved in the queue or decided: skip updates that change nothing
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then
    return null;
  end if;
  -- Timetable edits are logged through timetable_changes; only uploads are logged here
  if tg_table_name = 'timetable_versions' and (tg_op <> 'INSERT' or to_jsonb(new) ->> 'name' not like 'Uploaded%') then
    return null;
  end if;
  insert into public.activity_log (actor, txid, tbl, op, old, new)
  values (nullif(public.current_email(), ''), txid_current(), tg_table_name, tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;


--
-- Name: move_request(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.move_request(p_id uuid, p_dir integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  g record;
  other record;
begin
  select group_id, room_id, date, min(priority) as priority, min(created_at) as created_at into g
    from public.requests
   where status = 'pending'
     and group_id = (select group_id from public.requests where id = p_id or group_id = p_id limit 1)
   group by group_id, room_id, date;
  if g.group_id is null then return; end if;

  select group_id, min(priority) as priority, min(created_at) as created_at into other
    from public.requests q
   where q.room_id = g.room_id and q.date = g.date and q.status = 'pending' and q.group_id <> g.group_id
   group by q.group_id
  having case when p_dir < 0 then (min(q.priority), min(q.created_at)) < (g.priority, g.created_at)
              else (min(q.priority), min(q.created_at)) > (g.priority, g.created_at) end
   order by case when p_dir < 0 then min(q.priority) end desc, case when p_dir < 0 then min(q.created_at) end desc,
            case when p_dir > 0 then min(q.priority) end asc,  case when p_dir > 0 then min(q.created_at) end asc
   limit 1;
  if other.group_id is null then return; end if;

  if other.priority = g.priority then
    update public.requests set priority = other.priority + case when p_dir < 0 then -1 else 1 end
     where group_id = g.group_id;
  else
    update public.requests set priority = other.priority where group_id = g.group_id;
    update public.requests set priority = g.priority where group_id = other.group_id;
  end if;
end $$;


--
-- Name: my_calendar_token(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_calendar_token() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.current_person();
  v_token text;
begin
  if me.email is null or not me.active then
    raise exception 'Only registered faculty have a calendar link' using errcode = '42501';
  end if;
  insert into public.calendar_feeds (email, token) values (me.email, public.new_feed_token())
  on conflict (email) do nothing;
  select token into v_token from public.calendar_feeds where email = me.email;
  return v_token;
end $$;


--
-- Name: my_schedule(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_schedule(p_from date, p_to date) RETURNS TABLE(date date, room_id text, room_name text, slot_id smallint, slot_label text, status text, subject text, ended boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET jit TO 'off'
    AS $$
  select d::date, s.room_id, s.room_name, s.slot_id, s.slot_label, s.status, s.subject, s.ended
  from generate_series(p_from, least(p_to, p_from + 31), interval '1 day') d
  cross join lateral public.get_day_schedule(d::date) s
  where s.is_mine
  order by d, s.starts, s.room_id
$$;


--
-- Name: new_feed_token(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.new_feed_token() RETURNS text
    LANGUAGE sql
    AS $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;


--
-- Name: regular_class(text, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.regular_class(p_room text, p_date date, p_slot integer) RETURNS TABLE(subject text, faculty text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET jit TO 'off'
    AS $$
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


--
-- Name: reject_others(text, date, integer, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_others(p_room text, p_date date, p_slot integer, p_except uuid, p_note text, p_by text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update public.requests
     set status = 'rejected', decided_by = p_by, decided_at = now(), decision_note = p_note
   where status = 'pending'
     and group_id in (select q.group_id from public.requests q
                       where q.room_id = p_room and q.date = p_date and q.slot_id = p_slot
                         and q.status = 'pending')
     and group_id is distinct from p_except
$$;


--
-- Name: reject_request(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_request(p_id uuid, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare me public.people := public.require_admin();
begin
  update public.requests
     set status = 'rejected', decided_by = me.email, decided_at = now(), decision_note = nullif(btrim(p_note), '')
   where status = 'pending'
     and group_id = (select group_id from public.requests where id = p_id or group_id = p_id limit 1);
  if not found then
    raise exception 'Request not found or already decided' using errcode = 'P0001';
  end if;
end $$;


--
-- Name: request_exchange(text, date, integer, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_exchange(p_room text, p_date date, p_slot integer, p_target text, p_note text DEFAULT ''::text, p_new_subject text DEFAULT NULL::text) RETURNS bigint
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.request_exchange_slots(p_room, p_date, array[p_slot], p_target, p_note, p_new_subject)
$$;


--
-- Name: request_exchange_slots(text, date, integer[], text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_exchange_slots(p_room text, p_date date, p_slots integer[], p_target text, p_note text DEFAULT ''::text, p_new_subject text DEFAULT NULL::text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  me public.people := public.current_person();
  v_slots int[] := public.consecutive_slots(p_slots);
  v_slot int;
  st record;
  v_subject text;
  v_target public.people;
  v_ini text := upper(btrim(coalesce(p_target, '')));
  v_id bigint;
begin
  if me.email is null then
    raise exception 'Only registered faculty can ask for a class exchange' using errcode = '42501';
  end if;
  if v_slots is null then
    raise exception 'Pick slots that run back to back' using errcode = 'P0001';
  end if;
  if public.slot_has_started(p_date, v_slots[1]) then
    raise exception 'This class has already started' using errcode = 'P0001';
  end if;
  foreach v_slot in array v_slots loop
    select d.status, d.is_mine, d.subject into st from public.get_day_schedule(p_date) d where d.room_id = p_room and d.slot_id = v_slot;
    if st.status is null or st.status not in ('class', 'booked') or not st.is_mine then
      raise exception 'You can only hand over a class that is yours' using errcode = 'P0001';
    end if;
    if v_subject is null then
      v_subject := st.subject;
    elsif st.subject is distinct from v_subject then
      raise exception 'Those slots have different classes; send one request for each' using errcode = 'P0001';
    end if;
  end loop;

  select * into v_target from public.people where initials = v_ini and active limit 1;
  if v_target.email is null then
    raise exception 'That faculty member has not signed in to the site yet, so they can''t accept a request. Ask an admin to assign them as a substitute instead.' using errcode = 'P0001';
  end if;
  if v_target.email = me.email then
    raise exception 'Pick someone other than yourself' using errcode = 'P0001';
  end if;
  foreach v_slot in array v_slots loop
    if not public.faculty_free_at(v_ini, p_date, v_slot) then
      raise exception '% is not free in every slot of this class', public.display_name(v_target) using errcode = 'P0001';
    end if;
  end loop;
  if exists (select 1 from public.class_exchanges x
              where x.room_id = p_room and x.date = p_date
                and public.exchange_slots(x) && v_slots
                and x.status in ('pending', 'accepted')) then
    raise exception 'This class already has an exchange request waiting. Withdraw it first to ask someone else.' using errcode = 'P0001';
  end if;

  -- The colleague teaches their own subject to the same class when they have one (e.g. COA-3E
  -- in place of DPM-3E), so the timetable shows what the students will actually have
  if nullif(btrim(coalesce(p_new_subject, '')), '') is null then
    select t.subject into p_new_subject
      from public.timetable_entries t
     where t.version_id = (select v.id from public.timetable_versions v
                            where p_date between v.valid_from and v.valid_to
                            order by v.valid_from desc, v.id desc limit 1)
       and v_ini = any (t.faculty_initials) and not t.is_department
       and upper(substring(t.subject from '-\s*(\d{1,2}[A-Za-z]?)$')) = upper(substring(v_subject from '-\s*(\d{1,2}[A-Za-z]?)$'))
     order by (t.subject ~ '\(P\)'), t.subject
     limit 1;
  end if;

  insert into public.class_exchanges (room_id, date, slot_id, slot_ids, subject, new_subject, requester_email, requester_name, requester_initials,
                                      target_initials, target_email, target_name, note)
  values (p_room, p_date, v_slots[1], v_slots, v_subject, coalesce(nullif(btrim(coalesce(p_new_subject, '')), ''), v_subject),
          me.email, public.display_name(me), me.initials,
          v_ini, v_target.email, public.display_name(v_target), left(btrim(coalesce(p_note, '')), 300))
  returning id into v_id;
  return v_id;
end $_$;


--
-- Name: request_resource(integer, text, integer, date, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_resource(p_supply integer, p_item text, p_qty integer, p_date date, p_room text, p_purpose text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.current_person();
  s public.supplies;
  v_id bigint;
begin
  if me.email is null or not me.active then
    raise exception 'Only registered faculty can request resources' using errcode = '42501';
  end if;
  if p_date is null or p_date < public.ist_today() then
    raise exception 'Pick today or a later date' using errcode = 'P0001';
  end if;
  if p_date > public.ist_today() + 60 then
    raise exception 'Resources can be requested up to two months ahead' using errcode = 'P0001';
  end if;
  if coalesce(p_qty, 0) < 1 then
    raise exception 'Ask for at least one' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_purpose, ''))) < 5 then
    raise exception 'Say what it is for' using errcode = 'P0001';
  end if;
  if p_supply is not null then
    select * into s from public.supplies where id = p_supply and active;
    if s.id is null then
      raise exception 'That item can''t be requested' using errcode = 'P0001';
    end if;
    if p_qty > s.stock then
      raise exception 'Only % % of % in stock', s.stock, s.unit, s.name using errcode = 'P0001';
    end if;
  elsif length(btrim(coalesce(p_item, ''))) = 0 then
    raise exception 'Say what you need, e.g. Lab 2 with 30 systems' using errcode = 'P0001';
  end if;
  insert into public.resource_requests (requester_email, requester_name, supply_id, item, quantity, needed_on, room_id, purpose)
  values (me.email, public.display_name(me), s.id, coalesce(s.name, btrim(p_item)), p_qty, p_date, nullif(p_room, ''), btrim(p_purpose))
  returning id into v_id;
  return v_id;
end $$;


--
-- Name: requests_guard_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.requests_guard_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare v_undo boolean := coalesce(current_setting('app.undo_decision', true), '') = 'on';
begin
  if public.slot_has_ended(old.date, old.slot_id) then
    raise exception 'This slot has already ended; past requests cannot be changed'
      using errcode = 'P0001';
  end if;
  if (new.room_id, new.date, new.slot_id, new.requester_email, new.requester_name,
      new.type, new.pdf_path, new.created_at, new.id, new.group_id)
     is distinct from
     (old.room_id, old.date, old.slot_id, old.requester_email, old.requester_name,
      old.type, old.pdf_path, old.created_at, old.id, old.group_id) then
    raise exception 'Only the status, priority, description and subject of a request can change'
      using errcode = 'P0001';
  end if;
  if (new.description, new.subject) is distinct from (old.description, old.subject)
     and (old.status <> 'pending' or new.status <> 'pending') then
    raise exception 'Only a pending request can be edited' using errcode = 'P0001';
  end if;
  if old.status <> 'pending' and new.status is distinct from old.status
     and not (v_undo and new.status = 'pending') then
    raise exception 'This request has already been decided' using errcode = 'P0001';
  end if;
  return new;
end $$;


--
-- Name: require_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_admin() RETURNS public.people
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare me public.people;
begin
  me := public.current_person();
  if me.email is null or me.role <> 'admin' then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return me;
end $$;


--
-- Name: reset_calendar_token(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_calendar_token() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare me public.people := public.current_person();
begin
  if me.email is null or not me.active then
    raise exception 'Only registered faculty have a calendar link' using errcode = '42501';
  end if;
  delete from public.calendar_feeds where email = me.email;
  return public.my_calendar_token();
end $$;


--
-- Name: resolve_faculty(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_faculty(p_faculty text, OUT initials text, OUT name text) RETURNS record
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v text := upper(regexp_replace(coalesce(p_faculty, ''), '\s', '', 'g'));
  v_list text[];
  v_bad text;
begin
  if v = '' then
    return;
  end if;
  if v in ('@A', '@B') then
    select array_agg(c.initials order by c.initials) into v_list from public.faculty_clusters c where c.cluster = substr(v, 2);
    if v_list is null then
      raise exception 'No faculty are in cluster %', substr(v, 2) using errcode = 'P0001';
    end if;
    initials := array_to_string(v_list, ',');
    name := 'Cluster ' || substr(v, 2) || ' faculty';
    return;
  end if;
  if v = '@ALL' then
    select array_agg(x order by x) into v_list from (
      select d.initials as x from public.faculty_directory d
      union select p.initials from public.people p where p.initials is not null and p.active and p.role <> 'admin'
    ) t;
    initials := array_to_string(v_list, ',');
    name := 'All department faculty';
    return;
  end if;
  select array_agg(distinct x) into v_list from unnest(string_to_array(v, ',')) x where x <> '';
  select x into v_bad from unnest(v_list) x
   where not exists (select 1 from public.people where people.initials = x and active)
     and not exists (select 1 from public.faculty_directory d where d.initials = x)
     and not exists (select 1 from public.timetable_entries t where x = any (t.faculty_initials))
   limit 1;
  if v_bad is not null then
    raise exception 'No faculty member has the initials %', v_bad using errcode = 'P0001';
  end if;
  -- In the order given
  select array_agg(x order by o) into v_list from (
    select x, min(o) as o from unnest(string_to_array(v, ',')) with ordinality as u(x, o) where x <> '' group by x
  ) t;
  initials := array_to_string(v_list, ',');
  name := public.faculty_display(v_list, null);
end $$;


--
-- Name: respond_exchange(bigint, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.respond_exchange(p_id bigint, p_accept boolean, p_note text DEFAULT ''::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.current_person();
  x public.class_exchanges;
  v_slot int;
begin
  select * into x from public.class_exchanges where id = p_id for update;
  if x.id is null or x.target_email <> me.email then
    raise exception 'Only the faculty member asked can answer this request' using errcode = '42501';
  end if;
  if x.status <> 'pending' then
    raise exception 'This request has already been answered or withdrawn' using errcode = 'P0001';
  end if;
  if public.slot_has_started(x.date, x.slot_id) then
    raise exception 'This class has already started' using errcode = 'P0001';
  end if;
  if p_accept then
    foreach v_slot in array public.exchange_slots(x) loop
      if not public.faculty_free_at(x.target_initials, x.date, v_slot) then
        raise exception 'You are no longer free in every slot of this class' using errcode = 'P0001';
      end if;
    end loop;
  end if;
  update public.class_exchanges
     set status = case when p_accept then 'accepted' else 'declined' end,
         response_note = nullif(left(btrim(coalesce(p_note, '')), 300), ''),
         responded_at = now()
   where id = p_id;
end $$;


--
-- Name: semester_change_days(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.semester_change_days(p_from date) RETURNS SETOF date
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select p_from
  union
  select v.valid_from from public.timetable_versions v where v.valid_from > p_from
  order by 1
$$;


--
-- Name: semester_version(date, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.semester_version(p_from date, p_name text, p_add text DEFAULT NULL::text, p_base integer DEFAULT NULL::integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_src public.timetable_versions := public.version_on(p_from);
  v_ended text[];
  v_new int;
begin
  if v_src.id is null then
    return;
  end if;
  select coalesce(array_agg(semester), '{}') into v_ended from public.semester_ends where last_day < p_from;

  insert into public.timetable_versions (name, valid_from, valid_to)
  values (p_name, p_from, v_src.valid_to)
  returning id into v_new;

  insert into public.timetable_entries (version_id, room_id, weekday, slot_id, subject, faculty_initials, faculty_label, is_department)
  select v_new, t.room_id, t.weekday, t.slot_id, t.subject, t.faculty_initials, t.faculty_label, t.is_department
    from public.timetable_entries t
   where t.version_id = v_src.id
     and not (cardinality(public.subject_semesters(t.subject)) > 0
              and public.subject_semesters(t.subject) <@ v_ended);

  if p_add is not null and p_base is not null then
    insert into public.timetable_entries (version_id, room_id, weekday, slot_id, subject, faculty_initials, faculty_label, is_department)
    select v_new, b.room_id, b.weekday, b.slot_id, b.subject, b.faculty_initials, b.faculty_label, b.is_department
      from public.timetable_entries b
     where b.version_id = p_base
       and p_add = any (public.subject_semesters(b.subject))
       and not (public.subject_semesters(b.subject) <@ v_ended)
       and not exists (select 1 from public.timetable_entries t
                        where t.version_id = v_new and t.room_id = b.room_id
                          and t.weekday = b.weekday and t.slot_id = b.slot_id);
  end if;
end $$;


--
-- Name: signed_up_initials(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.signed_up_initials() RETURNS SETOF text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select initials from public.people where active and initials is not null and public.is_staff()
$$;


--
-- Name: slot_closed(date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.slot_closed(p_date date, p_slot integer) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select extract(isodow from p_date) in (6, 7)
     and public.day_order(p_date) = 6
     and coalesce((select s.starts >= time '14:00' from public.slots s where s.id = p_slot), false)
$$;


--
-- Name: slot_end_at(date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.slot_end_at(p_date date, p_slot integer) RETURNS timestamp with time zone
    LANGUAGE sql STABLE
    AS $$
  select ((p_date + s.ends) at time zone 'Asia/Kolkata') from public.slots s where s.id = p_slot
$$;


--
-- Name: slot_has_ended(date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.slot_has_ended(p_date date, p_slot integer) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ select coalesce(public.slot_end_at(p_date, p_slot) <= now(), true) $$;


--
-- Name: slot_has_started(date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.slot_has_started(p_date date, p_slot integer) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select public.slot_has_ended(p_date, p_slot)
      or (p_date = public.ist_today() and (select starts from public.slots where id = p_slot) <= public.ist_now()::time)
$$;


--
-- Name: slot_requests(text, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.slot_requests(p_room text, p_from date, p_to date) RETURNS TABLE(id uuid, room_id text, date date, slot_id smallint, requester_name text, type public.request_type, subject text, description text, status public.request_status, created_at timestamp with time zone, decided_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET jit TO 'off'
    AS $$
  select r.id, r.room_id, r.date, r.slot_id, r.requester_name, r.type, r.subject, r.description,
         r.status, r.created_at, r.decided_at
  from public.requests r
  where (p_room is null or r.room_id = p_room)
    and r.date between p_from and least(p_to, p_from + 31)
    and r.status <> 'withdrawn'
  order by r.date, r.slot_id, r.room_id, (r.status = 'pending') desc, r.priority, r.created_at
$$;


--
-- Name: slot_state(text, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.slot_state(p_room text, p_date date, p_slot integer) RETURNS TABLE(status text, is_mine boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET jit TO 'off'
    AS $$
  select d.status, d.is_mine from public.get_day_schedule(p_date) d
  where d.room_id = p_room and d.slot_id = p_slot
$$;


--
-- Name: subject_semesters(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.subject_semesters(p_subject text) RETURNS text[]
    LANGUAGE sql IMMUTABLE
    AS $_$
  select coalesce(array_agg(distinct left(k, 1)), '{}')
  from (select upper(btrim(k)) as k
          from regexp_split_to_table(coalesce(substring(p_subject from '-([^-]*)$'), ''), '[/,&]') as k) t
  where k ~ '^\d[A-Z]?$'
$_$;


--
-- Name: timetable_entries_guard_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.timetable_entries_guard_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if (select count(*) from public.timetable_versions) > 1
     and (select valid_from from public.timetable_versions where id = new.version_id) < public.ist_today() then
    raise exception 'Cannot add entries to a timetable version that has already started'
      using errcode = 'P0001';
  end if;
  return new;
end $$;


--
-- Name: timetable_subjects(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.timetable_subjects() RETURNS TABLE(initials text, subject text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET jit TO 'off'
    AS $$
  select distinct i.ini, upper(btrim(t.subject))
    from public.timetable_entries t
    join public.timetable_versions v on v.id = t.version_id and v.valid_to >= public.ist_today()
    cross join lateral unnest(t.faculty_initials) as i(ini)
   where not t.is_department and btrim(t.subject) <> '' and length(btrim(t.subject)) <= 40
$$;


--
-- Name: timetable_versions_guard_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.timetable_versions_guard_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if exists (select 1 from public.timetable_versions) and new.valid_from < public.ist_today() then
    raise exception 'A timetable revision must start today or later' using errcode = 'P0001';
  end if;
  return new;
end $$;


--
-- Name: undo_drop(text, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.undo_drop(p_room text, p_date date, p_slot integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.current_person();
  v_drop public.allotments;
  v_before public.allotments;
begin
  if me.email is null then
    raise exception 'Only registered faculty can undo a dropped class' using errcode = '42501';
  end if;
  if public.slot_has_ended(p_date, p_slot) or (p_date = public.ist_today() and (select starts from public.slots where id = p_slot) <= public.ist_now()::time) then
    raise exception 'This class has already started, so it can''t be brought back' using errcode = 'P0001';
  end if;
  select * into v_drop from public.allotments
   where room_id = p_room and date = p_date and slot_id = p_slot order by id desc limit 1;
  if v_drop.id is null or v_drop.kind <> 'drop' or v_drop.created_by <> me.email then
    raise exception 'Only your own dropped class can be brought back, and only if nothing has changed in that slot since' using errcode = 'P0001';
  end if;
  select * into v_before from public.allotments
   where room_id = p_room and date = p_date and slot_id = p_slot and id < v_drop.id order by id desc limit 1;
  if v_before.id is not null and v_before.kind in ('class_request', 'event_request') then
    insert into public.allotments (room_id, date, slot_id, kind, title, faculty_email, faculty_name, reason, request_id, created_by)
    values (p_room, p_date, p_slot, v_before.kind, v_before.title, v_before.faculty_email, v_before.faculty_name,
            'Drop undone by ' || public.display_name(me), v_before.request_id, me.email);
  else
    insert into public.allotments (room_id, date, slot_id, kind, reason, faculty_email, faculty_name, created_by)
    values (p_room, p_date, p_slot, 'restore', 'Drop undone by ' || public.display_name(me), me.email, public.display_name(me), me.email);
  end if;
  perform public.reject_others(p_room, p_date, p_slot, null, 'The faculty member brought their class back', me.email);
end $$;


--
-- Name: upcoming_bookings(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upcoming_bookings(p_days integer DEFAULT 14) RETURNS TABLE(date date, room_id text, slot_id smallint, kind public.allotment_kind, title text, faculty_name text, reason text, approved_by text, allotted boolean, original_subject text, original_faculty text)
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
  left join lateral public.regular_class(l.room_id, l.date, l.slot_id) o on true
  where l.kind in ('class_request', 'event_request', 'cie', 'event')
    and not public.slot_has_ended(l.date, l.slot_id)
  order by l.date, l.slot_id, l.room_id
$$;


--
-- Name: timetable_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timetable_versions (
    id integer NOT NULL,
    name text NOT NULL,
    valid_from date NOT NULL,
    valid_to date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT timetable_versions_check CHECK ((valid_to >= valid_from))
);


--
-- Name: version_on(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.version_on(p_date date) RETURNS public.timetable_versions
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select v.* from public.timetable_versions v
   where p_date between v.valid_from and v.valid_to
   order by v.valid_from desc, v.id desc limit 1
$$;


--
-- Name: withdraw_exchange(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.withdraw_exchange(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.current_person();
  x public.class_exchanges;
begin
  select * into x from public.class_exchanges where id = p_id for update;
  if x.id is null or x.requester_email <> me.email then
    raise exception 'Only your own request can be withdrawn' using errcode = '42501';
  end if;
  if x.status not in ('pending', 'accepted') then
    raise exception 'This request has already been decided' using errcode = 'P0001';
  end if;
  update public.class_exchanges set status = 'withdrawn' where id = p_id;
end $$;


--
-- Name: withdraw_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.withdraw_request(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.requests set status = 'withdrawn', decided_at = now(), decided_by = public.current_email()
   where requester_email = public.current_email() and status = 'pending'
     and group_id = (select group_id from public.requests where id = p_id or group_id = p_id limit 1);
  if not found then
    raise exception 'Request not found or already decided' using errcode = 'P0001';
  end if;
end $$;


--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    id bigint NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    actor text,
    txid bigint NOT NULL,
    tbl text NOT NULL,
    op text NOT NULL,
    old jsonb,
    new jsonb,
    CONSTRAINT activity_log_op_check CHECK ((op = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: activity_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.activity_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activity_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.activity_log_id_seq OWNED BY public.activity_log.id;


--
-- Name: allotments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.allotments (
    id bigint NOT NULL,
    room_id text NOT NULL,
    date date NOT NULL,
    slot_id smallint NOT NULL,
    kind public.allotment_kind NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    faculty_email text,
    faculty_name text,
    reason text DEFAULT ''::text NOT NULL,
    request_id uuid,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    faculty_initials text
);


--
-- Name: allotments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.allotments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: allotments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.allotments_id_seq OWNED BY public.allotments.id;


--
-- Name: calendar_feeds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_feeds (
    email text NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: class_exchanges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.class_exchanges_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: class_exchanges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.class_exchanges_id_seq OWNED BY public.class_exchanges.id;


--
-- Name: day_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.day_orders (
    date date NOT NULL,
    follows smallint NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT day_orders_follows_check CHECK (((follows >= 1) AND (follows <= 6)))
);


--
-- Name: equipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment (
    id integer NOT NULL,
    name text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT equipment_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 60))),
    CONSTRAINT equipment_notes_check CHECK ((length(notes) <= 120))
);


--
-- Name: equipment_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment_bookings (
    id bigint NOT NULL,
    equipment_id integer NOT NULL,
    date date NOT NULL,
    slot_id smallint NOT NULL,
    room_id text,
    purpose text DEFAULT ''::text NOT NULL,
    booked_by text NOT NULL,
    booked_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cancelled_at timestamp with time zone,
    cancelled_by text,
    CONSTRAINT equipment_bookings_purpose_check CHECK ((length(purpose) <= 120))
);


--
-- Name: equipment_bookings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.equipment_bookings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equipment_bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.equipment_bookings_id_seq OWNED BY public.equipment_bookings.id;


--
-- Name: equipment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.equipment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equipment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.equipment_id_seq OWNED BY public.equipment.id;


--
-- Name: faculty_clusters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faculty_clusters (
    initials text NOT NULL,
    cluster text NOT NULL,
    updated_by text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT faculty_clusters_cluster_check CHECK ((cluster = ANY (ARRAY['A'::text, 'B'::text]))),
    CONSTRAINT faculty_clusters_initials_check CHECK ((length(btrim(initials)) > 0))
);


--
-- Name: faculty_directory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faculty_directory (
    initials text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    full_name text DEFAULT ''::text NOT NULL
);


--
-- Name: faculty_duties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faculty_duties (
    initials text NOT NULL,
    weekday smallint NOT NULL,
    slot_id smallint NOT NULL,
    activity text NOT NULL,
    updated_by text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT faculty_duties_activity_check CHECK (((length(btrim(activity)) > 0) AND (length(activity) <= 60))),
    CONSTRAINT faculty_duties_initials_check CHECK ((length(btrim(initials)) > 0)),
    CONSTRAINT faculty_duties_weekday_check CHECK (((weekday >= 1) AND (weekday <= 6)))
);


--
-- Name: faculty_leave; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faculty_leave (
    id bigint NOT NULL,
    initials text NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT faculty_leave_check CHECK (((ends_on >= starts_on) AND ((ends_on - starts_on) <= 90))),
    CONSTRAINT faculty_leave_initials_check CHECK ((length(btrim(initials)) > 0)),
    CONSTRAINT faculty_leave_reason_check CHECK ((length(reason) <= 120))
);


--
-- Name: faculty_leave_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.faculty_leave_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: faculty_leave_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.faculty_leave_id_seq OWNED BY public.faculty_leave.id;


--
-- Name: faculty_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faculty_subjects (
    email text NOT NULL,
    subject text NOT NULL,
    source text DEFAULT 'admin'::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT faculty_subjects_source_check CHECK ((source = ANY (ARRAY['admin'::text, 'timetable'::text]))),
    CONSTRAINT faculty_subjects_subject_check CHECK (((length(btrim(subject)) > 0) AND (length(subject) <= 40)))
);


--
-- Name: holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.holidays (
    date date NOT NULL,
    name text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT holidays_name_check CHECK ((length(btrim(name)) > 0))
);


--
-- Name: notices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notices (
    id bigint NOT NULL,
    message text NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notices_check CHECK ((ends_on >= starts_on)),
    CONSTRAINT notices_message_check CHECK (((length(btrim(message)) >= 1) AND (length(btrim(message)) <= 300)))
);


--
-- Name: notices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notices_id_seq OWNED BY public.notices.id;


--
-- Name: requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id text NOT NULL,
    date date NOT NULL,
    slot_id smallint NOT NULL,
    requester_email text NOT NULL,
    requester_name text NOT NULL,
    type public.request_type NOT NULL,
    description text NOT NULL,
    pdf_path text,
    status public.request_status DEFAULT 'pending'::public.request_status NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    decided_by text,
    decided_at timestamp with time zone,
    decision_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    group_id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject text,
    CONSTRAINT requests_description_check CHECK ((length(btrim(description)) >= 5))
);


--
-- Name: resource_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_requests (
    id bigint NOT NULL,
    requester_email text NOT NULL,
    requester_name text NOT NULL,
    supply_id integer,
    item text NOT NULL,
    quantity integer NOT NULL,
    needed_on date NOT NULL,
    room_id text,
    purpose text NOT NULL,
    status public.resource_status DEFAULT 'pending'::public.resource_status NOT NULL,
    decided_by text,
    decided_at timestamp with time zone,
    decision_note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT resource_requests_item_check CHECK (((length(btrim(item)) >= 1) AND (length(btrim(item)) <= 80))),
    CONSTRAINT resource_requests_purpose_check CHECK (((length(btrim(purpose)) >= 5) AND (length(btrim(purpose)) <= 300))),
    CONSTRAINT resource_requests_quantity_check CHECK (((quantity >= 1) AND (quantity <= 1000)))
);


--
-- Name: resource_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.resource_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: resource_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.resource_requests_id_seq OWNED BY public.resource_requests.id;


--
-- Name: rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rooms (
    id text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    capacity integer,
    kind text DEFAULT 'classroom'::text NOT NULL,
    projector boolean DEFAULT false NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    CONSTRAINT rooms_capacity_check CHECK (((capacity IS NULL) OR ((capacity >= 1) AND (capacity <= 1000)))),
    CONSTRAINT rooms_kind_check CHECK ((kind = ANY (ARRAY['classroom'::text, 'lab'::text, 'seminar'::text])))
);


--
-- Name: semester_ends; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.semester_ends (
    semester text NOT NULL,
    last_day date NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT semester_ends_semester_check CHECK ((semester ~ '^\d$'::text))
);


--
-- Name: slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.slots (
    id smallint NOT NULL,
    starts time without time zone NOT NULL,
    ends time without time zone NOT NULL,
    label text NOT NULL,
    CONSTRAINT slots_check CHECK ((ends > starts))
);


--
-- Name: supplies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplies (
    id integer NOT NULL,
    name text NOT NULL,
    unit text DEFAULT 'pcs'::text NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplies_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 60))),
    CONSTRAINT supplies_stock_check CHECK ((stock >= 0)),
    CONSTRAINT supplies_unit_check CHECK (((length(btrim(unit)) >= 1) AND (length(btrim(unit)) <= 20)))
);


--
-- Name: supplies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supplies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supplies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.supplies_id_seq OWNED BY public.supplies.id;


--
-- Name: timetable_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timetable_changes (
    id bigint NOT NULL,
    version_id integer NOT NULL,
    room_id text NOT NULL,
    weekday smallint NOT NULL,
    slot_ids smallint[] NOT NULL,
    old_value text DEFAULT ''::text NOT NULL,
    new_value text DEFAULT ''::text NOT NULL,
    effective_from date NOT NULL,
    changed_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT timetable_changes_weekday_check CHECK (((weekday >= 1) AND (weekday <= 6)))
);


--
-- Name: timetable_changes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.timetable_changes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: timetable_changes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.timetable_changes_id_seq OWNED BY public.timetable_changes.id;


--
-- Name: timetable_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timetable_entries (
    id bigint NOT NULL,
    version_id integer NOT NULL,
    room_id text NOT NULL,
    weekday smallint NOT NULL,
    slot_id smallint NOT NULL,
    subject text NOT NULL,
    faculty_initials text[] DEFAULT '{}'::text[] NOT NULL,
    faculty_label text DEFAULT ''::text NOT NULL,
    is_department boolean DEFAULT false NOT NULL,
    CONSTRAINT timetable_entries_weekday_check CHECK (((weekday >= 1) AND (weekday <= 6)))
);


--
-- Name: timetable_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.timetable_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: timetable_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.timetable_entries_id_seq OWNED BY public.timetable_entries.id;


--
-- Name: timetable_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.timetable_versions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: timetable_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.timetable_versions_id_seq OWNED BY public.timetable_versions.id;


--
-- Name: activity_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log ALTER COLUMN id SET DEFAULT nextval('public.activity_log_id_seq'::regclass);


--
-- Name: allotments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allotments ALTER COLUMN id SET DEFAULT nextval('public.allotments_id_seq'::regclass);


--
-- Name: class_exchanges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_exchanges ALTER COLUMN id SET DEFAULT nextval('public.class_exchanges_id_seq'::regclass);


--
-- Name: equipment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment ALTER COLUMN id SET DEFAULT nextval('public.equipment_id_seq'::regclass);


--
-- Name: equipment_bookings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_bookings ALTER COLUMN id SET DEFAULT nextval('public.equipment_bookings_id_seq'::regclass);


--
-- Name: faculty_leave id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_leave ALTER COLUMN id SET DEFAULT nextval('public.faculty_leave_id_seq'::regclass);


--
-- Name: notices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notices ALTER COLUMN id SET DEFAULT nextval('public.notices_id_seq'::regclass);


--
-- Name: resource_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_requests ALTER COLUMN id SET DEFAULT nextval('public.resource_requests_id_seq'::regclass);


--
-- Name: supplies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplies ALTER COLUMN id SET DEFAULT nextval('public.supplies_id_seq'::regclass);


--
-- Name: timetable_changes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_changes ALTER COLUMN id SET DEFAULT nextval('public.timetable_changes_id_seq'::regclass);


--
-- Name: timetable_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_entries ALTER COLUMN id SET DEFAULT nextval('public.timetable_entries_id_seq'::regclass);


--
-- Name: timetable_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_versions ALTER COLUMN id SET DEFAULT nextval('public.timetable_versions_id_seq'::regclass);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: allotments allotments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allotments
    ADD CONSTRAINT allotments_pkey PRIMARY KEY (id);


--
-- Name: calendar_feeds calendar_feeds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_feeds
    ADD CONSTRAINT calendar_feeds_pkey PRIMARY KEY (email);


--
-- Name: calendar_feeds calendar_feeds_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_feeds
    ADD CONSTRAINT calendar_feeds_token_key UNIQUE (token);


--
-- Name: class_exchanges class_exchanges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_exchanges
    ADD CONSTRAINT class_exchanges_pkey PRIMARY KEY (id);


--
-- Name: day_orders day_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.day_orders
    ADD CONSTRAINT day_orders_pkey PRIMARY KEY (date);


--
-- Name: equipment_bookings equipment_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_bookings
    ADD CONSTRAINT equipment_bookings_pkey PRIMARY KEY (id);


--
-- Name: equipment equipment_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_name_key UNIQUE (name);


--
-- Name: equipment equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_pkey PRIMARY KEY (id);


--
-- Name: faculty_clusters faculty_clusters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_clusters
    ADD CONSTRAINT faculty_clusters_pkey PRIMARY KEY (initials);


--
-- Name: faculty_directory faculty_directory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_directory
    ADD CONSTRAINT faculty_directory_pkey PRIMARY KEY (initials);


--
-- Name: faculty_duties faculty_duties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_duties
    ADD CONSTRAINT faculty_duties_pkey PRIMARY KEY (initials, weekday, slot_id);


--
-- Name: faculty_leave faculty_leave_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_leave
    ADD CONSTRAINT faculty_leave_pkey PRIMARY KEY (id);


--
-- Name: faculty_subjects faculty_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_subjects
    ADD CONSTRAINT faculty_subjects_pkey PRIMARY KEY (email, subject);


--
-- Name: holidays holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_pkey PRIMARY KEY (date);


--
-- Name: notices notices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notices
    ADD CONSTRAINT notices_pkey PRIMARY KEY (id);


--
-- Name: people people_initials_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_initials_key UNIQUE (initials);


--
-- Name: people people_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_pkey PRIMARY KEY (email);


--
-- Name: requests requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT requests_pkey PRIMARY KEY (id);


--
-- Name: resource_requests resource_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_requests
    ADD CONSTRAINT resource_requests_pkey PRIMARY KEY (id);


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);


--
-- Name: semester_ends semester_ends_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semester_ends
    ADD CONSTRAINT semester_ends_pkey PRIMARY KEY (semester);


--
-- Name: slots slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slots
    ADD CONSTRAINT slots_pkey PRIMARY KEY (id);


--
-- Name: supplies supplies_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplies
    ADD CONSTRAINT supplies_name_key UNIQUE (name);


--
-- Name: supplies supplies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplies
    ADD CONSTRAINT supplies_pkey PRIMARY KEY (id);


--
-- Name: timetable_changes timetable_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_changes
    ADD CONSTRAINT timetable_changes_pkey PRIMARY KEY (id);


--
-- Name: timetable_entries timetable_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_entries
    ADD CONSTRAINT timetable_entries_pkey PRIMARY KEY (id);


--
-- Name: timetable_entries timetable_entries_version_id_room_id_weekday_slot_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_entries
    ADD CONSTRAINT timetable_entries_version_id_room_id_weekday_slot_id_key UNIQUE (version_id, room_id, weekday, slot_id);


--
-- Name: timetable_versions timetable_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_versions
    ADD CONSTRAINT timetable_versions_pkey PRIMARY KEY (id);


--
-- Name: activity_log_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_log_actor ON public.activity_log USING btree (actor, id DESC);


--
-- Name: activity_log_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_log_at ON public.activity_log USING btree (id DESC);


--
-- Name: allotments_date_room_id_slot_id_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX allotments_date_room_id_slot_id_id_idx ON public.allotments USING btree (date, room_id, slot_id, id DESC);


--
-- Name: class_exchanges_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_exchanges_open ON public.class_exchanges USING btree (status, date);


--
-- Name: class_exchanges_requester; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_exchanges_requester ON public.class_exchanges USING btree (requester_email, date DESC);


--
-- Name: class_exchanges_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_exchanges_target ON public.class_exchanges USING btree (target_email, date DESC);


--
-- Name: equipment_bookings_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX equipment_bookings_date ON public.equipment_bookings USING btree (date);


--
-- Name: equipment_one_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX equipment_one_booking ON public.equipment_bookings USING btree (equipment_id, date, slot_id) WHERE (cancelled_at IS NULL);


--
-- Name: faculty_duties_weekday; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faculty_duties_weekday ON public.faculty_duties USING btree (weekday, slot_id);


--
-- Name: faculty_leave_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faculty_leave_dates ON public.faculty_leave USING btree (starts_on, ends_on);


--
-- Name: requests_date_slot_id_room_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX requests_date_slot_id_room_id_idx ON public.requests USING btree (date, slot_id, room_id);


--
-- Name: requests_group_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX requests_group_id_idx ON public.requests USING btree (group_id);


--
-- Name: requests_one_pending_per_person; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX requests_one_pending_per_person ON public.requests USING btree (room_id, date, slot_id, requester_email) WHERE (status = 'pending'::public.request_status);


--
-- Name: requests_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX requests_pending ON public.requests USING btree (date, slot_id) WHERE (status = 'pending'::public.request_status);


--
-- Name: requests_requester_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX requests_requester_email_idx ON public.requests USING btree (requester_email);


--
-- Name: resource_requests_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resource_requests_pending ON public.resource_requests USING btree (needed_on) WHERE (status = 'pending'::public.resource_status);


--
-- Name: resource_requests_requester; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resource_requests_requester ON public.resource_requests USING btree (requester_email, id DESC);


--
-- Name: timetable_entries_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timetable_entries_day ON public.timetable_entries USING btree (version_id, weekday, slot_id);


--
-- Name: allotments allotments_cie_coordinators; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER allotments_cie_coordinators BEFORE INSERT ON public.allotments FOR EACH ROW EXECUTE FUNCTION public.allotments_cie_coordinators();


--
-- Name: allotments allotments_fill_initials; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER allotments_fill_initials BEFORE INSERT ON public.allotments FOR EACH ROW EXECUTE FUNCTION public.allotments_fill_initials();


--
-- Name: allotments allotments_guard_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER allotments_guard_insert BEFORE INSERT ON public.allotments FOR EACH ROW EXECUTE FUNCTION public.allotments_guard_insert();


--
-- Name: allotments allotments_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER allotments_no_update BEFORE DELETE OR UPDATE ON public.allotments FOR EACH ROW EXECUTE FUNCTION public.forbid_change();


--
-- Name: holidays holidays_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER holidays_guard BEFORE DELETE OR UPDATE ON public.holidays FOR EACH ROW EXECUTE FUNCTION public.holidays_guard();


--
-- Name: allotments log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.allotments FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: day_orders log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.day_orders FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: equipment log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: equipment_bookings log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.equipment_bookings FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: faculty_clusters log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.faculty_clusters FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: faculty_directory log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.faculty_directory FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: faculty_duties log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.faculty_duties FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: faculty_leave log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.faculty_leave FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: faculty_subjects log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.faculty_subjects FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: holidays log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.holidays FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: notices log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.notices FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: people log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: requests log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: resource_requests log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.resource_requests FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: rooms log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: semester_ends log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.semester_ends FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: supplies log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.supplies FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: timetable_changes log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.timetable_changes FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: timetable_versions log_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_activity AFTER INSERT OR DELETE OR UPDATE ON public.timetable_versions FOR EACH ROW EXECUTE FUNCTION public.log_activity();


--
-- Name: requests requests_guard_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER requests_guard_update BEFORE UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.requests_guard_update();


--
-- Name: requests requests_no_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER requests_no_delete BEFORE DELETE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.forbid_change();


--
-- Name: timetable_changes timetable_changes_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER timetable_changes_no_update BEFORE DELETE OR UPDATE ON public.timetable_changes FOR EACH ROW EXECUTE FUNCTION public.forbid_change();


--
-- Name: timetable_entries timetable_entries_guard_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER timetable_entries_guard_insert BEFORE INSERT ON public.timetable_entries FOR EACH ROW EXECUTE FUNCTION public.timetable_entries_guard_insert();


--
-- Name: timetable_entries timetable_entries_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER timetable_entries_no_update BEFORE DELETE OR UPDATE ON public.timetable_entries FOR EACH ROW EXECUTE FUNCTION public.forbid_change();


--
-- Name: timetable_versions timetable_versions_guard_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER timetable_versions_guard_insert BEFORE INSERT ON public.timetable_versions FOR EACH ROW EXECUTE FUNCTION public.timetable_versions_guard_insert();


--
-- Name: timetable_versions timetable_versions_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER timetable_versions_no_update BEFORE DELETE OR UPDATE ON public.timetable_versions FOR EACH ROW EXECUTE FUNCTION public.forbid_change();


--
-- Name: allotments allotments_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allotments
    ADD CONSTRAINT allotments_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.requests(id);


--
-- Name: allotments allotments_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allotments
    ADD CONSTRAINT allotments_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id);


--
-- Name: allotments allotments_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allotments
    ADD CONSTRAINT allotments_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.slots(id);


--
-- Name: calendar_feeds calendar_feeds_email_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_feeds
    ADD CONSTRAINT calendar_feeds_email_fkey FOREIGN KEY (email) REFERENCES public.people(email) ON DELETE CASCADE;


--
-- Name: class_exchanges class_exchanges_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_exchanges
    ADD CONSTRAINT class_exchanges_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id);


--
-- Name: class_exchanges class_exchanges_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_exchanges
    ADD CONSTRAINT class_exchanges_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.slots(id);


--
-- Name: equipment_bookings equipment_bookings_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_bookings
    ADD CONSTRAINT equipment_bookings_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id);


--
-- Name: equipment_bookings equipment_bookings_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_bookings
    ADD CONSTRAINT equipment_bookings_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id);


--
-- Name: equipment_bookings equipment_bookings_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_bookings
    ADD CONSTRAINT equipment_bookings_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.slots(id);


--
-- Name: faculty_duties faculty_duties_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_duties
    ADD CONSTRAINT faculty_duties_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.slots(id);


--
-- Name: faculty_subjects faculty_subjects_email_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_subjects
    ADD CONSTRAINT faculty_subjects_email_fkey FOREIGN KEY (email) REFERENCES public.people(email);


--
-- Name: requests requests_requester_email_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT requests_requester_email_fkey FOREIGN KEY (requester_email) REFERENCES public.people(email);


--
-- Name: requests requests_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT requests_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id);


--
-- Name: requests requests_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT requests_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.slots(id);


--
-- Name: resource_requests resource_requests_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_requests
    ADD CONSTRAINT resource_requests_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id);


--
-- Name: resource_requests resource_requests_supply_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_requests
    ADD CONSTRAINT resource_requests_supply_id_fkey FOREIGN KEY (supply_id) REFERENCES public.supplies(id);


--
-- Name: timetable_changes timetable_changes_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_changes
    ADD CONSTRAINT timetable_changes_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id);


--
-- Name: timetable_changes timetable_changes_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_changes
    ADD CONSTRAINT timetable_changes_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.timetable_versions(id);


--
-- Name: timetable_entries timetable_entries_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_entries
    ADD CONSTRAINT timetable_entries_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id);


--
-- Name: timetable_entries timetable_entries_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_entries
    ADD CONSTRAINT timetable_entries_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.slots(id);


--
-- Name: timetable_entries timetable_entries_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timetable_entries
    ADD CONSTRAINT timetable_entries_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.timetable_versions(id);


--
-- Name: activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_log admins read activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read activity" ON public.activity_log FOR SELECT USING (public.is_admin());


--
-- Name: faculty_clusters admins read faculty clusters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read faculty clusters" ON public.faculty_clusters FOR SELECT USING (public.is_admin());


--
-- Name: faculty_duties admins read faculty duties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read faculty duties" ON public.faculty_duties FOR SELECT USING (public.is_admin());


--
-- Name: faculty_leave admins read leave; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read leave" ON public.faculty_leave FOR SELECT USING (public.is_admin());


--
-- Name: allotments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.allotments ENABLE ROW LEVEL SECURITY;

--
-- Name: day_orders anyone reads day orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anyone reads day orders" ON public.day_orders FOR SELECT USING (true);


--
-- Name: equipment anyone reads equipment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anyone reads equipment" ON public.equipment FOR SELECT USING (true);


--
-- Name: faculty_directory anyone reads faculty names; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anyone reads faculty names" ON public.faculty_directory FOR SELECT USING (true);


--
-- Name: holidays anyone reads holidays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anyone reads holidays" ON public.holidays FOR SELECT USING (true);


--
-- Name: notices anyone reads notices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anyone reads notices" ON public.notices FOR SELECT USING (true);


--
-- Name: rooms anyone reads rooms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anyone reads rooms" ON public.rooms FOR SELECT USING (true);


--
-- Name: semester_ends anyone reads semester ends; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anyone reads semester ends" ON public.semester_ends FOR SELECT USING (true);


--
-- Name: slots anyone reads slots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anyone reads slots" ON public.slots FOR SELECT USING (true);


--
-- Name: timetable_entries anyone reads timetable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anyone reads timetable" ON public.timetable_entries FOR SELECT USING (true);


--
-- Name: timetable_versions anyone reads versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anyone reads versions" ON public.timetable_versions FOR SELECT USING (true);


--
-- Name: calendar_feeds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_feeds ENABLE ROW LEVEL SECURITY;

--
-- Name: class_exchanges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_exchanges ENABLE ROW LEVEL SECURITY;

--
-- Name: day_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.day_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.equipment_bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: faculty_duties faculty read own duties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "faculty read own duties" ON public.faculty_duties FOR SELECT USING ((initials = ( SELECT p.initials
   FROM public.people p
  WHERE ((p.email = public.current_email()) AND p.active))));


--
-- Name: faculty_clusters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faculty_clusters ENABLE ROW LEVEL SECURITY;

--
-- Name: faculty_directory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faculty_directory ENABLE ROW LEVEL SECURITY;

--
-- Name: faculty_duties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faculty_duties ENABLE ROW LEVEL SECURITY;

--
-- Name: faculty_leave; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faculty_leave ENABLE ROW LEVEL SECURITY;

--
-- Name: faculty_subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faculty_subjects ENABLE ROW LEVEL SECURITY;

--
-- Name: holidays; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

--
-- Name: notices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_requests own or admin reads resource requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own or admin reads resource requests" ON public.resource_requests FOR SELECT USING (((requester_email = public.current_email()) OR public.is_admin()));


--
-- Name: requests own requests or admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own requests or admin" ON public.requests FOR SELECT USING (((requester_email = public.current_email()) OR public.is_admin()));


--
-- Name: people; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

--
-- Name: class_exchanges people in an exchange and admins read it; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "people in an exchange and admins read it" ON public.class_exchanges FOR SELECT USING (((requester_email = public.current_email()) OR (target_email = public.current_email()) OR public.is_admin()));


--
-- Name: requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resource_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: semester_ends; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.semester_ends ENABLE ROW LEVEL SECURITY;

--
-- Name: slots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.slots ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_bookings staff read equipment bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read equipment bookings" ON public.equipment_bookings FOR SELECT USING (public.is_staff());


--
-- Name: allotments staff read history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read history" ON public.allotments FOR SELECT USING (public.is_staff());


--
-- Name: faculty_subjects staff read own subjects, admins read all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read own subjects, admins read all" ON public.faculty_subjects FOR SELECT USING (((email = public.current_email()) OR public.is_admin()));


--
-- Name: people staff read self, admins read all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read self, admins read all" ON public.people FOR SELECT USING (((email = public.current_email()) OR public.is_admin()));


--
-- Name: supplies staff read supplies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read supplies" ON public.supplies FOR SELECT USING (public.is_staff());


--
-- Name: timetable_changes staff read timetable changes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read timetable changes" ON public.timetable_changes FOR SELECT USING (public.is_staff());


--
-- Name: supplies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplies ENABLE ROW LEVEL SECURITY;

--
-- Name: timetable_changes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timetable_changes ENABLE ROW LEVEL SECURITY;

--
-- Name: timetable_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: timetable_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timetable_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: FUNCTION admin_add_holiday(p_date date, p_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_add_holiday(p_date date, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_add_holiday(p_date date, p_name text) TO authenticated;


--
-- Name: FUNCTION admin_add_leave(p_initials text, p_from date, p_to date, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_add_leave(p_initials text, p_from date, p_to date, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_add_leave(p_initials text, p_from date, p_to date, p_reason text) TO authenticated;


--
-- Name: FUNCTION admin_add_notice(p_message text, p_starts date, p_ends date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_add_notice(p_message text, p_starts date, p_ends date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_add_notice(p_message text, p_starts date, p_ends date) TO authenticated;


--
-- Name: FUNCTION admin_add_room(p_room text, p_capacity integer, p_kind text, p_projector boolean, p_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_add_room(p_room text, p_capacity integer, p_kind text, p_projector boolean, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_add_room(p_room text, p_capacity integer, p_kind text, p_projector boolean, p_notes text) TO authenticated;


--
-- Name: FUNCTION admin_add_subject(p_email text, p_subject text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_add_subject(p_email text, p_subject text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_add_subject(p_email text, p_subject text) TO authenticated;


--
-- Name: FUNCTION admin_archive_room(p_room text, p_archived boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_archive_room(p_room text, p_archived boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_archive_room(p_room text, p_archived boolean) TO authenticated;


--
-- Name: FUNCTION admin_bulk_allot(p_places jsonb, p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text, p_semesters text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_bulk_allot(p_places jsonb, p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text, p_semesters text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_bulk_allot(p_places jsonb, p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text, p_semesters text[]) TO authenticated;


--
-- Name: FUNCTION admin_cancel_semester_classes(p_date date, p_semesters text[], p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_cancel_semester_classes(p_date date, p_semesters text[], p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_cancel_semester_classes(p_date date, p_semesters text[], p_reason text) TO authenticated;


--
-- Name: FUNCTION admin_copy_holidays(p_from date, p_to date, p_years integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_copy_holidays(p_from date, p_to date, p_years integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_copy_holidays(p_from date, p_to date, p_years integer) TO authenticated;


--
-- Name: FUNCTION admin_decide_exchange(p_id bigint, p_approve boolean, p_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_decide_exchange(p_id bigint, p_approve boolean, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_decide_exchange(p_id bigint, p_approve boolean, p_note text) TO authenticated;


--
-- Name: FUNCTION admin_decide_resource(p_id bigint, p_approve boolean, p_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_decide_resource(p_id bigint, p_approve boolean, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_decide_resource(p_id bigint, p_approve boolean, p_note text) TO authenticated;


--
-- Name: FUNCTION admin_delete_equipment(p_id integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_delete_equipment(p_id integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_delete_equipment(p_id integer) TO authenticated;


--
-- Name: FUNCTION admin_delete_faculty(p_initials text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_delete_faculty(p_initials text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_delete_faculty(p_initials text) TO authenticated;


--
-- Name: FUNCTION admin_delete_person(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_delete_person(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_delete_person(p_email text) TO authenticated;


--
-- Name: FUNCTION admin_delete_record(p_room text, p_date date, p_slots integer[], p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_delete_record(p_room text, p_date date, p_slots integer[], p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_delete_record(p_room text, p_date date, p_slots integer[], p_reason text) TO authenticated;


--
-- Name: FUNCTION admin_delete_room(p_room text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_delete_room(p_room text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_delete_room(p_room text) TO authenticated;


--
-- Name: FUNCTION admin_edit_booking(p_room text, p_date date, p_slot integer, p_title text, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_edit_booking(p_room text, p_date date, p_slot integer, p_title text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_edit_booking(p_room text, p_date date, p_slot integer, p_title text, p_reason text) TO authenticated;


--
-- Name: FUNCTION admin_edit_record(p_room text, p_date date, p_slots integer[], p_title text, p_reason text, p_faculty text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_edit_record(p_room text, p_date date, p_slots integer[], p_title text, p_reason text, p_faculty text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_edit_record(p_room text, p_date date, p_slots integer[], p_title text, p_reason text, p_faculty text) TO authenticated;


--
-- Name: FUNCTION admin_edit_timetable(p_room text, p_weekday integer, p_slots integer[], p_subject text, p_initials text[], p_is_department boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_edit_timetable(p_room text, p_weekday integer, p_slots integer[], p_subject text, p_initials text[], p_is_department boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_edit_timetable(p_room text, p_weekday integer, p_slots integer[], p_subject text, p_initials text[], p_is_department boolean) TO authenticated;


--
-- Name: FUNCTION admin_end_semester(p_semester text, p_last_day date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_end_semester(p_semester text, p_last_day date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_end_semester(p_semester text, p_last_day date) TO authenticated;


--
-- Name: FUNCTION admin_free_slots(p_room text, p_date date, p_slots integer[], p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_free_slots(p_room text, p_date date, p_slots integer[], p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_free_slots(p_room text, p_date date, p_slots integer[], p_reason text) TO authenticated;


--
-- Name: FUNCTION admin_override(p_room text, p_date date, p_slot integer, p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_override(p_room text, p_date date, p_slot integer, p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_override(p_room text, p_date date, p_slot integer, p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text) TO authenticated;


--
-- Name: FUNCTION admin_override_many(p_places jsonb, p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_override_many(p_places jsonb, p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_override_many(p_places jsonb, p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text) TO authenticated;


--
-- Name: FUNCTION admin_override_slots(p_room text, p_date date, p_slots integer[], p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_override_slots(p_room text, p_date date, p_slots integer[], p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_override_slots(p_room text, p_date date, p_slots integer[], p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text) TO authenticated;


--
-- Name: FUNCTION admin_remove_faculty(p_initials text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_remove_faculty(p_initials text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_remove_faculty(p_initials text) TO authenticated;


--
-- Name: FUNCTION admin_remove_holiday(p_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_remove_holiday(p_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_remove_holiday(p_date date) TO authenticated;


--
-- Name: FUNCTION admin_remove_leave(p_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_remove_leave(p_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_remove_leave(p_id bigint) TO authenticated;


--
-- Name: FUNCTION admin_remove_notice(p_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_remove_notice(p_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_remove_notice(p_id bigint) TO authenticated;


--
-- Name: FUNCTION admin_remove_subject(p_email text, p_subject text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_remove_subject(p_email text, p_subject text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_remove_subject(p_email text, p_subject text) TO authenticated;


--
-- Name: FUNCTION admin_rename_booking(p_room text, p_date date, p_slot integer, p_title text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_rename_booking(p_room text, p_date date, p_slot integer, p_title text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_rename_booking(p_room text, p_date date, p_slot integer, p_title text) TO authenticated;


--
-- Name: FUNCTION admin_rename_room(p_room text, p_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_rename_room(p_room text, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_rename_room(p_room text, p_name text) TO authenticated;


--
-- Name: FUNCTION admin_rename_subject(p_email text, p_old text, p_new text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_rename_subject(p_email text, p_old text, p_new text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_rename_subject(p_email text, p_old text, p_new text) TO authenticated;


--
-- Name: FUNCTION admin_replace_faculty_duties(p_initials text[], p_entries jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_replace_faculty_duties(p_initials text[], p_entries jsonb) TO authenticated;


--
-- Name: FUNCTION admin_replace_timetable(p_rooms text[], p_entries jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_replace_timetable(p_rooms text[], p_entries jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_replace_timetable(p_rooms text[], p_entries jsonb) TO authenticated;


--
-- Name: FUNCTION admin_restore(p_room text, p_date date, p_slot integer, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_restore(p_room text, p_date date, p_slot integer, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_restore(p_room text, p_date date, p_slot integer, p_reason text) TO authenticated;


--
-- Name: FUNCTION admin_rollover(p_duties boolean, p_subjects text, p_leave boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_rollover(p_duties boolean, p_subjects text, p_leave boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_rollover(p_duties boolean, p_subjects text, p_leave boolean) TO authenticated;


--
-- Name: FUNCTION admin_rooms_in_use(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_rooms_in_use() FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_rooms_in_use() TO authenticated;


--
-- Name: FUNCTION admin_save_equipment(p_id integer, p_name text, p_notes text, p_active boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_save_equipment(p_id integer, p_name text, p_notes text, p_active boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_save_equipment(p_id integer, p_name text, p_notes text, p_active boolean) TO authenticated;


--
-- Name: FUNCTION admin_save_faculty(p_old_initials text, p_initials text, p_title text, p_full_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_save_faculty(p_old_initials text, p_initials text, p_title text, p_full_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_save_faculty(p_old_initials text, p_initials text, p_title text, p_full_name text) TO authenticated;


--
-- Name: FUNCTION admin_save_supply(p_id integer, p_name text, p_unit text, p_stock integer, p_active boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_save_supply(p_id integer, p_name text, p_unit text, p_stock integer, p_active boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_save_supply(p_id integer, p_name text, p_unit text, p_stock integer, p_active boolean) TO authenticated;


--
-- Name: FUNCTION admin_set_day_order(p_date date, p_follows integer, p_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_set_day_order(p_date date, p_follows integer, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_set_day_order(p_date date, p_follows integer, p_note text) TO authenticated;


--
-- Name: FUNCTION admin_set_faculty_clusters(p_entries jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_set_faculty_clusters(p_entries jsonb) TO authenticated;


--
-- Name: FUNCTION admin_set_faculty_duty(p_initials text, p_weekday integer, p_slots integer[], p_activity text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_set_faculty_duty(p_initials text, p_weekday integer, p_slots integer[], p_activity text) TO authenticated;


--
-- Name: FUNCTION admin_subjects_from_timetable(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_subjects_from_timetable() FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_subjects_from_timetable() TO authenticated;


--
-- Name: FUNCTION admin_undo_decision(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_undo_decision(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_undo_decision(p_id uuid) TO authenticated;


--
-- Name: FUNCTION admin_undo_exchange(p_id bigint, p_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_undo_exchange(p_id bigint, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_undo_exchange(p_id bigint, p_note text) TO authenticated;


--
-- Name: FUNCTION admin_undo_semester_end(p_semester text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_undo_semester_end(p_semester text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_undo_semester_end(p_semester text) TO authenticated;


--
-- Name: FUNCTION admin_update_holiday(p_date date, p_new_date date, p_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_update_holiday(p_date date, p_new_date date, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_update_holiday(p_date date, p_new_date date, p_name text) TO authenticated;


--
-- Name: FUNCTION admin_update_leave(p_id bigint, p_from date, p_to date, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_update_leave(p_id bigint, p_from date, p_to date, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_update_leave(p_id bigint, p_from date, p_to date, p_reason text) TO authenticated;


--
-- Name: FUNCTION admin_update_notice(p_id bigint, p_message text, p_starts date, p_ends date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_update_notice(p_id bigint, p_message text, p_starts date, p_ends date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_update_notice(p_id bigint, p_message text, p_starts date, p_ends date) TO authenticated;


--
-- Name: FUNCTION admin_update_room(p_room text, p_capacity integer, p_kind text, p_projector boolean, p_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_update_room(p_room text, p_capacity integer, p_kind text, p_projector boolean, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_update_room(p_room text, p_capacity integer, p_kind text, p_projector boolean, p_notes text) TO authenticated;


--
-- Name: FUNCTION admin_upsert_person(p_email text, p_full_name text, p_initials text, p_title text, p_role public.app_role, p_active boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_upsert_person(p_email text, p_full_name text, p_initials text, p_title text, p_role public.app_role, p_active boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_upsert_person(p_email text, p_full_name text, p_initials text, p_title text, p_role public.app_role, p_active boolean) TO authenticated;


--
-- Name: FUNCTION allotments_guard_insert(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.allotments_guard_insert() FROM PUBLIC;


--
-- Name: FUNCTION approve_request(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.approve_request(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.approve_request(p_id uuid) TO authenticated;


--
-- Name: FUNCTION book_equipment(p_equipment integer, p_date date, p_slots integer[], p_room text, p_purpose text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.book_equipment(p_equipment integer, p_date date, p_slots integer[], p_room text, p_purpose text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.book_equipment(p_equipment integer, p_date date, p_slots integer[], p_room text, p_purpose text) TO authenticated;


--
-- Name: FUNCTION booking_window_check(p_date date, p_slot integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.booking_window_check(p_date date, p_slot integer) FROM PUBLIC;


--
-- Name: FUNCTION calendar_feed(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.calendar_feed(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_feed(p_token text) TO anon;
GRANT ALL ON FUNCTION public.calendar_feed(p_token text) TO authenticated;


--
-- Name: FUNCTION cancel_equipment(p_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_equipment(p_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_equipment(p_id bigint) TO authenticated;


--
-- Name: FUNCTION cancel_resource_request(p_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_resource_request(p_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_resource_request(p_id bigint) TO authenticated;


--
-- Name: FUNCTION consecutive_slots(p_slots integer[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.consecutive_slots(p_slots integer[]) TO anon;
GRANT ALL ON FUNCTION public.consecutive_slots(p_slots integer[]) TO authenticated;


--
-- Name: FUNCTION create_group_request(p_room text, p_date date, p_slots integer[], p_type public.request_type, p_description text, p_pdf_path text, p_subject text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_group_request(p_room text, p_date date, p_slots integer[], p_type public.request_type, p_description text, p_pdf_path text, p_subject text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_group_request(p_room text, p_date date, p_slots integer[], p_type public.request_type, p_description text, p_pdf_path text, p_subject text) TO authenticated;


--
-- Name: FUNCTION create_request(p_room text, p_date date, p_slot integer, p_type public.request_type, p_description text, p_pdf_path text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_request(p_room text, p_date date, p_slot integer, p_type public.request_type, p_description text, p_pdf_path text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_request(p_room text, p_date date, p_slot integer, p_type public.request_type, p_description text, p_pdf_path text) TO authenticated;


--
-- Name: FUNCTION current_email(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.current_email() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_email() TO authenticated;
GRANT ALL ON FUNCTION public.current_email() TO anon;


--
-- Name: TABLE people; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.people TO anon;
GRANT SELECT ON TABLE public.people TO authenticated;


--
-- Name: FUNCTION current_person(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.current_person() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_person() TO authenticated;


--
-- Name: FUNCTION day_order(p_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.day_order(p_date date) TO anon;
GRANT ALL ON FUNCTION public.day_order(p_date date) TO authenticated;


--
-- Name: FUNCTION display_name(p public.people); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.display_name(p public.people) FROM PUBLIC;


--
-- Name: FUNCTION drop_class(p_room text, p_date date, p_slot integer, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.drop_class(p_room text, p_date date, p_slot integer, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.drop_class(p_room text, p_date date, p_slot integer, p_reason text) TO authenticated;


--
-- Name: FUNCTION edit_equipment_booking(p_id bigint, p_room text, p_purpose text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.edit_equipment_booking(p_id bigint, p_room text, p_purpose text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.edit_equipment_booking(p_id bigint, p_room text, p_purpose text) TO authenticated;


--
-- Name: FUNCTION edit_request(p_id uuid, p_description text, p_subject text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.edit_request(p_id uuid, p_description text, p_subject text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.edit_request(p_id uuid, p_description text, p_subject text) TO authenticated;


--
-- Name: TABLE class_exchanges; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.class_exchanges TO authenticated;


--
-- Name: FUNCTION exchange_slots(x public.class_exchanges); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.exchange_slots(x public.class_exchanges) TO anon;
GRANT ALL ON FUNCTION public.exchange_slots(x public.class_exchanges) TO authenticated;


--
-- Name: FUNCTION faculty_display(p_initials text[], p_label text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.faculty_display(p_initials text[], p_label text) FROM PUBLIC;


--
-- Name: FUNCTION faculty_free_at(p_initials text, p_date date, p_slot integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.faculty_free_at(p_initials text, p_date date, p_slot integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.faculty_free_at(p_initials text, p_date date, p_slot integer) TO authenticated;


--
-- Name: FUNCTION faculty_status(p_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.faculty_status(p_date date) TO anon;
GRANT ALL ON FUNCTION public.faculty_status(p_date date) TO authenticated;


--
-- Name: FUNCTION forbid_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.forbid_change() FROM PUBLIC;


--
-- Name: FUNCTION get_change_report(p_from date, p_to date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_change_report(p_from date, p_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_change_report(p_from date, p_to date) TO authenticated;


--
-- Name: FUNCTION get_class_days(p_from date, p_to date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_class_days(p_from date, p_to date) TO anon;
GRANT ALL ON FUNCTION public.get_class_days(p_from date, p_to date) TO authenticated;


--
-- Name: FUNCTION get_day_schedule(p_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_day_schedule(p_date date) TO anon;
GRANT ALL ON FUNCTION public.get_day_schedule(p_date date) TO authenticated;


--
-- Name: FUNCTION get_timetable(p_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_timetable(p_date date) TO anon;
GRANT ALL ON FUNCTION public.get_timetable(p_date date) TO authenticated;


--
-- Name: FUNCTION get_timetable_all(p_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_timetable_all(p_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_timetable_all(p_date date) TO anon;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO anon;


--
-- Name: FUNCTION is_staff(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_staff() TO authenticated;
GRANT ALL ON FUNCTION public.is_staff() TO anon;


--
-- Name: FUNCTION is_working_day(p_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_working_day(p_date date) TO anon;
GRANT ALL ON FUNCTION public.is_working_day(p_date date) TO authenticated;


--
-- Name: FUNCTION ist_now(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ist_now() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ist_now() TO anon;
GRANT ALL ON FUNCTION public.ist_now() TO authenticated;


--
-- Name: FUNCTION ist_today(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ist_today() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ist_today() TO anon;
GRANT ALL ON FUNCTION public.ist_today() TO authenticated;


--
-- Name: FUNCTION move_request(p_id uuid, p_dir integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.move_request(p_id uuid, p_dir integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.move_request(p_id uuid, p_dir integer) TO authenticated;


--
-- Name: FUNCTION my_calendar_token(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.my_calendar_token() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_calendar_token() TO authenticated;


--
-- Name: FUNCTION my_schedule(p_from date, p_to date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_schedule(p_from date, p_to date) TO authenticated;


--
-- Name: FUNCTION regular_class(p_room text, p_date date, p_slot integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.regular_class(p_room text, p_date date, p_slot integer) TO anon;
GRANT ALL ON FUNCTION public.regular_class(p_room text, p_date date, p_slot integer) TO authenticated;


--
-- Name: FUNCTION reject_others(p_room text, p_date date, p_slot integer, p_except uuid, p_note text, p_by text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reject_others(p_room text, p_date date, p_slot integer, p_except uuid, p_note text, p_by text) FROM PUBLIC;


--
-- Name: FUNCTION reject_request(p_id uuid, p_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reject_request(p_id uuid, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reject_request(p_id uuid, p_note text) TO authenticated;


--
-- Name: FUNCTION request_exchange(p_room text, p_date date, p_slot integer, p_target text, p_note text, p_new_subject text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.request_exchange(p_room text, p_date date, p_slot integer, p_target text, p_note text, p_new_subject text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_exchange(p_room text, p_date date, p_slot integer, p_target text, p_note text, p_new_subject text) TO authenticated;


--
-- Name: FUNCTION request_exchange_slots(p_room text, p_date date, p_slots integer[], p_target text, p_note text, p_new_subject text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.request_exchange_slots(p_room text, p_date date, p_slots integer[], p_target text, p_note text, p_new_subject text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_exchange_slots(p_room text, p_date date, p_slots integer[], p_target text, p_note text, p_new_subject text) TO authenticated;


--
-- Name: FUNCTION request_resource(p_supply integer, p_item text, p_qty integer, p_date date, p_room text, p_purpose text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.request_resource(p_supply integer, p_item text, p_qty integer, p_date date, p_room text, p_purpose text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_resource(p_supply integer, p_item text, p_qty integer, p_date date, p_room text, p_purpose text) TO authenticated;


--
-- Name: FUNCTION requests_guard_update(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.requests_guard_update() FROM PUBLIC;


--
-- Name: FUNCTION require_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.require_admin() FROM PUBLIC;


--
-- Name: FUNCTION reset_calendar_token(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reset_calendar_token() FROM PUBLIC;
GRANT ALL ON FUNCTION public.reset_calendar_token() TO authenticated;


--
-- Name: FUNCTION resolve_faculty(p_faculty text, OUT initials text, OUT name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_faculty(p_faculty text, OUT initials text, OUT name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_faculty(p_faculty text, OUT initials text, OUT name text) TO authenticated;


--
-- Name: FUNCTION respond_exchange(p_id bigint, p_accept boolean, p_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.respond_exchange(p_id bigint, p_accept boolean, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.respond_exchange(p_id bigint, p_accept boolean, p_note text) TO authenticated;


--
-- Name: FUNCTION semester_version(p_from date, p_name text, p_add text, p_base integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.semester_version(p_from date, p_name text, p_add text, p_base integer) FROM PUBLIC;


--
-- Name: FUNCTION signed_up_initials(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.signed_up_initials() FROM PUBLIC;
GRANT ALL ON FUNCTION public.signed_up_initials() TO authenticated;


--
-- Name: FUNCTION slot_closed(p_date date, p_slot integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.slot_closed(p_date date, p_slot integer) TO anon;
GRANT ALL ON FUNCTION public.slot_closed(p_date date, p_slot integer) TO authenticated;


--
-- Name: FUNCTION slot_end_at(p_date date, p_slot integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.slot_end_at(p_date date, p_slot integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.slot_end_at(p_date date, p_slot integer) TO anon;
GRANT ALL ON FUNCTION public.slot_end_at(p_date date, p_slot integer) TO authenticated;


--
-- Name: FUNCTION slot_has_ended(p_date date, p_slot integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.slot_has_ended(p_date date, p_slot integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.slot_has_ended(p_date date, p_slot integer) TO anon;
GRANT ALL ON FUNCTION public.slot_has_ended(p_date date, p_slot integer) TO authenticated;


--
-- Name: FUNCTION slot_has_started(p_date date, p_slot integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.slot_has_started(p_date date, p_slot integer) TO anon;
GRANT ALL ON FUNCTION public.slot_has_started(p_date date, p_slot integer) TO authenticated;


--
-- Name: FUNCTION slot_requests(p_room text, p_from date, p_to date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.slot_requests(p_room text, p_from date, p_to date) TO anon;
GRANT ALL ON FUNCTION public.slot_requests(p_room text, p_from date, p_to date) TO authenticated;


--
-- Name: FUNCTION slot_state(p_room text, p_date date, p_slot integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.slot_state(p_room text, p_date date, p_slot integer) FROM PUBLIC;


--
-- Name: FUNCTION subject_semesters(p_subject text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.subject_semesters(p_subject text) TO anon;
GRANT ALL ON FUNCTION public.subject_semesters(p_subject text) TO authenticated;


--
-- Name: FUNCTION timetable_entries_guard_insert(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.timetable_entries_guard_insert() FROM PUBLIC;


--
-- Name: FUNCTION timetable_subjects(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.timetable_subjects() TO authenticated;


--
-- Name: FUNCTION timetable_versions_guard_insert(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.timetable_versions_guard_insert() FROM PUBLIC;


--
-- Name: FUNCTION undo_drop(p_room text, p_date date, p_slot integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.undo_drop(p_room text, p_date date, p_slot integer) TO authenticated;


--
-- Name: FUNCTION upcoming_bookings(p_days integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.upcoming_bookings(p_days integer) TO anon;
GRANT ALL ON FUNCTION public.upcoming_bookings(p_days integer) TO authenticated;


--
-- Name: TABLE timetable_versions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.timetable_versions TO anon;
GRANT SELECT ON TABLE public.timetable_versions TO authenticated;


--
-- Name: FUNCTION version_on(p_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.version_on(p_date date) TO anon;
GRANT ALL ON FUNCTION public.version_on(p_date date) TO authenticated;


--
-- Name: FUNCTION withdraw_exchange(p_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.withdraw_exchange(p_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.withdraw_exchange(p_id bigint) TO authenticated;


--
-- Name: FUNCTION withdraw_request(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.withdraw_request(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.withdraw_request(p_id uuid) TO authenticated;


--
-- Name: TABLE activity_log; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.activity_log TO authenticated;


--
-- Name: TABLE allotments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.allotments TO anon;
GRANT SELECT ON TABLE public.allotments TO authenticated;


--
-- Name: TABLE day_orders; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.day_orders TO anon;
GRANT SELECT ON TABLE public.day_orders TO authenticated;


--
-- Name: TABLE equipment; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.equipment TO anon;
GRANT SELECT ON TABLE public.equipment TO authenticated;


--
-- Name: TABLE equipment_bookings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.equipment_bookings TO authenticated;


--
-- Name: TABLE faculty_clusters; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.faculty_clusters TO authenticated;


--
-- Name: TABLE faculty_directory; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.faculty_directory TO anon;
GRANT SELECT ON TABLE public.faculty_directory TO authenticated;


--
-- Name: TABLE faculty_duties; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.faculty_duties TO authenticated;


--
-- Name: TABLE faculty_leave; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.faculty_leave TO authenticated;


--
-- Name: TABLE faculty_subjects; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.faculty_subjects TO authenticated;


--
-- Name: TABLE holidays; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.holidays TO anon;
GRANT SELECT ON TABLE public.holidays TO authenticated;


--
-- Name: TABLE notices; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.notices TO anon;
GRANT SELECT ON TABLE public.notices TO authenticated;


--
-- Name: TABLE requests; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.requests TO anon;
GRANT SELECT ON TABLE public.requests TO authenticated;


--
-- Name: TABLE resource_requests; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.resource_requests TO authenticated;


--
-- Name: TABLE rooms; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.rooms TO anon;
GRANT SELECT ON TABLE public.rooms TO authenticated;


--
-- Name: TABLE semester_ends; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.semester_ends TO anon;
GRANT SELECT ON TABLE public.semester_ends TO authenticated;


--
-- Name: TABLE slots; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.slots TO anon;
GRANT SELECT ON TABLE public.slots TO authenticated;


--
-- Name: TABLE supplies; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.supplies TO authenticated;


--
-- Name: TABLE timetable_changes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.timetable_changes TO authenticated;


--
-- Name: TABLE timetable_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.timetable_entries TO anon;
GRANT SELECT ON TABLE public.timetable_entries TO authenticated;


--
-- PostgreSQL database dump complete
--

-- ---------------------------------------------------------------------------
-- Faculty names for the timetable initials
-- ---------------------------------------------------------------------------

insert into public.faculty_directory (initials, title, full_name) VALUES ('ACM', 'Dr.', 'Anthony Christy Melson');
insert into public.faculty_directory (initials, title, full_name) VALUES ('AG', 'Prof.', 'Asha G');
insert into public.faculty_directory (initials, title, full_name) VALUES ('AKN', 'Dr.', 'Ashok Kumar N');
insert into public.faculty_directory (initials, title, full_name) VALUES ('AMK', 'Prof.', 'Amaresha K');
insert into public.faculty_directory (initials, title, full_name) VALUES ('APR', 'Dr.', 'Ambika PR');
insert into public.faculty_directory (initials, title, full_name) VALUES ('AS', 'Prof.', 'Amitha S');
insert into public.faculty_directory (initials, title, full_name) VALUES ('BHL', 'Prof.', 'Bhavyashree H L');
insert into public.faculty_directory (initials, title, full_name) VALUES ('BM', 'Dr.', 'Bandaru Mallikarjuna');
insert into public.faculty_directory (initials, title, full_name) VALUES ('CG', 'Dr.', 'Chandrashekara G');
insert into public.faculty_directory (initials, title, full_name) VALUES ('CS', 'Prof.', 'Suprity Chakraborty');
insert into public.faculty_directory (initials, title, full_name) VALUES ('CV', 'Dr.', 'Chethana V');
insert into public.faculty_directory (initials, title, full_name) VALUES ('GDS', 'Dr.', 'Girish D.S.');
insert into public.faculty_directory (initials, title, full_name) VALUES ('GRP', 'Dr.', 'Prasad G.R.');
insert into public.faculty_directory (initials, title, full_name) VALUES ('GSS', 'Prof.', 'Spoorthi G.S.');
insert into public.faculty_directory (initials, title, full_name) VALUES ('HC', 'Dr.', 'Hemanth Kumar C');
insert into public.faculty_directory (initials, title, full_name) VALUES ('JS', 'Dr.', 'Jahnavi S');
insert into public.faculty_directory (initials, title, full_name) VALUES ('KS', 'Prof.', 'Kavyashree');
insert into public.faculty_directory (initials, title, full_name) VALUES ('LBK', 'Prof.', 'Lavanya B Koppal');
insert into public.faculty_directory (initials, title, full_name) VALUES ('LMR', 'Prof.', 'Latha MR');
insert into public.faculty_directory (initials, title, full_name) VALUES ('MD', 'Dr.', 'Dakshayini M');
insert into public.faculty_directory (initials, title, full_name) VALUES ('MK', 'Prof.', 'Maithri K');
insert into public.faculty_directory (initials, title, full_name) VALUES ('MP', 'Dr.', 'Monika P');
insert into public.faculty_directory (initials, title, full_name) VALUES ('MS', 'Dr.', 'M Shekar');
insert into public.faculty_directory (initials, title, full_name) VALUES ('NCR', 'Dr.', 'Nagrathna C R');
insert into public.faculty_directory (initials, title, full_name) VALUES ('NM', 'Prof.', 'Nida Mohammadi');
insert into public.faculty_directory (initials, title, full_name) VALUES ('NNK', 'Prof.', 'Nayana NK');
insert into public.faculty_directory (initials, title, full_name) VALUES ('PB', 'Prof.', 'Pallavi B');
insert into public.faculty_directory (initials, title, full_name) VALUES ('PN', 'Prof.', 'Priyanka N');
insert into public.faculty_directory (initials, title, full_name) VALUES ('PR', 'Prof.', 'Puneeth R');
insert into public.faculty_directory (initials, title, full_name) VALUES ('RH', 'Prof.', 'Ranjini H');
insert into public.faculty_directory (initials, title, full_name) VALUES ('RK', 'Prof.', 'Renuka Devi K');
insert into public.faculty_directory (initials, title, full_name) VALUES ('RMR', 'Dr.', 'Rajeshwari M R');
insert into public.faculty_directory (initials, title, full_name) VALUES ('RN', 'Prof.', 'Rutuparna N');
insert into public.faculty_directory (initials, title, full_name) VALUES ('RV', 'Prof.', 'Vaishnavi R');
insert into public.faculty_directory (initials, title, full_name) VALUES ('SA', 'Prof.', 'Spoorti Admani');
insert into public.faculty_directory (initials, title, full_name) VALUES ('SBM', 'Prof.', 'Swaroop B.M.');
insert into public.faculty_directory (initials, title, full_name) VALUES ('SD', 'Prof.', 'Shridevi A Desai');
insert into public.faculty_directory (initials, title, full_name) VALUES ('SKS', 'Prof.', 'Shailashree K Sheshadri');
insert into public.faculty_directory (initials, title, full_name) VALUES ('SMU', 'Prof.', 'Syeeda Mujeebunnisa');
insert into public.faculty_directory (initials, title, full_name) VALUES ('SP', 'Prof.', 'Supriya P');
insert into public.faculty_directory (initials, title, full_name) VALUES ('SR', 'Prof.', 'Sudhindra R');
insert into public.faculty_directory (initials, title, full_name) VALUES ('SS', 'Prof.', 'Sunil Sungas');
insert into public.faculty_directory (initials, title, full_name) VALUES ('SSB', 'Prof.', 'Swapna Subhash Banasode');
insert into public.faculty_directory (initials, title, full_name) VALUES ('SSK', 'Dr.', 'Sanket S Kulkarni');
insert into public.faculty_directory (initials, title, full_name) VALUES ('STN', 'Prof.', 'Suma T N');
insert into public.faculty_directory (initials, title, full_name) VALUES ('SVN', 'Dr.', 'Sandeep Varma N');
insert into public.faculty_directory (initials, title, full_name) VALUES ('UP', 'Prof.', 'Upeksha Prasad G');
insert into public.faculty_directory (initials, title, full_name) VALUES ('VBG', 'Dr.', 'Vishruth BG');
insert into public.faculty_directory (initials, title, full_name) VALUES ('VH', 'Dr.', 'Vinutha H');
insert into public.faculty_directory (initials, title, full_name) VALUES ('VMJ', 'Prof.', 'Vamshi M Jois');
insert into public.faculty_directory (initials, title, full_name) VALUES ('VR', 'Prof.', 'Varsha R');
insert into public.faculty_directory (initials, title, full_name) VALUES ('VS', 'Prof.', 'Vishwas S');
insert into public.faculty_directory (initials, title, full_name) VALUES ('YBM', 'Prof.', 'Yashaswini B M');
insert into public.faculty_directory (initials, title, full_name) VALUES ('YR', 'Prof.', 'Yashaswi R');
insert into public.faculty_directory (initials, title, full_name) VALUES ('LKB', 'Prof.', '');
insert into public.faculty_directory (initials, title, full_name) VALUES ('MHM', 'Prof.', '');
insert into public.faculty_directory (initials, title, full_name) VALUES ('PP', 'Prof.', '');
insert into public.faculty_directory (initials, title, full_name) VALUES ('PPM', 'Prof.', '');
insert into public.faculty_directory (initials, title, full_name) VALUES ('RS', 'Prof.', '');

-- The names above are setup, not changes anyone made: start the activity log empty
truncate public.activity_log restart identity;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for approval letters (PDF, at most 5 MB)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('letters', 'letters', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy "staff upload own letters" on storage.objects for insert to authenticated
  with check (bucket_id = 'letters' and public.is_staff()
              and (storage.foldername(name))[1] = public.current_email());

create policy "own letters or admin" on storage.objects for select to authenticated
  using (bucket_id = 'letters'
         and ((storage.foldername(name))[1] = public.current_email() or public.is_admin()));

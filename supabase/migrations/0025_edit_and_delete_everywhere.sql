-- Edit and delete wherever it was missing:
--  1. Holidays can be renamed or moved to another (future) date.
--  2. Notices can be edited.
--  3. Leave can be edited.
--  4. Faculty can edit the description and subject of a pending request.
--  5. Admins can undo an approval or a rejection while the slot hasn't ended.
--  6. Equipment bookings can be edited (room and purpose); unused equipment can be deleted.
--  7. Anyone on the sign-in list can be deleted (not only faculty with initials).
--  8. Rooms can be renamed and archived. An archived room keeps its history but is hidden
--     everywhere rooms are listed and can't be booked.
--  9. Subjects can be renamed.
-- Depends on 0020, 0022, 0023 and 0024.

-- ---------------------------------------------------------------------------
-- 1. Holidays
-- ---------------------------------------------------------------------------

create or replace function public.holidays_guard() returns trigger
language plpgsql as $$
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

create or replace function public.admin_update_holiday(p_date date, p_new_date date, p_name text) returns void
language plpgsql security definer set search_path = public as $$
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
revoke execute on function public.admin_update_holiday(date, date, text) from public, anon;
grant execute on function public.admin_update_holiday(date, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Notices
-- ---------------------------------------------------------------------------

create or replace function public.admin_update_notice(p_id bigint, p_message text, p_starts date, p_ends date) returns void
language plpgsql security definer set search_path = public as $$
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
revoke execute on function public.admin_update_notice(bigint, text, date, date) from public, anon;
grant execute on function public.admin_update_notice(bigint, text, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Leave
-- ---------------------------------------------------------------------------

create or replace function public.admin_update_leave(p_id bigint, p_from date, p_to date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
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
revoke execute on function public.admin_update_leave(bigint, date, date, text) from public, anon;
grant execute on function public.admin_update_leave(bigint, date, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4 and 5. Requests: edit while pending, undo a decision
-- ---------------------------------------------------------------------------

-- A pending request's description and subject can change (through edit_request); a decided
-- request can go back to pending only through admin_undo_decision.
create or replace function public.requests_guard_update() returns trigger
language plpgsql as $$
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

create or replace function public.edit_request(p_id uuid, p_description text, p_subject text) returns void
language plpgsql security definer set search_path = public as $$
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
revoke execute on function public.edit_request(uuid, text, text) from public, anon;
grant execute on function public.edit_request(uuid, text, text) to authenticated;

-- Puts a decided request back in the queue. An approval is undone by giving the slots back
-- (the booking stays in the history, followed by a "restore"), and the requests that were
-- declined because of it go back to pending too.
create or replace function public.admin_undo_decision(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
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
revoke execute on function public.admin_undo_decision(uuid) from public, anon;
grant execute on function public.admin_undo_decision(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Equipment
-- ---------------------------------------------------------------------------

create or replace function public.edit_equipment_booking(p_id bigint, p_room text, p_purpose text) returns void
language plpgsql security definer set search_path = public as $$
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
revoke execute on function public.edit_equipment_booking(bigint, text, text) from public, anon;
grant execute on function public.edit_equipment_booking(bigint, text, text) to authenticated;

create or replace function public.admin_delete_equipment(p_id int) returns void
language plpgsql security definer set search_path = public as $$
declare me public.people := public.require_admin();
begin
  if exists (select 1 from public.equipment_bookings where equipment_id = p_id) then
    raise exception 'It has bookings on record, so retire it instead' using errcode = 'P0001';
  end if;
  delete from public.equipment where id = p_id;
end $$;
revoke execute on function public.admin_delete_equipment(int) from public, anon;
grant execute on function public.admin_delete_equipment(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Anyone on the sign-in list
-- ---------------------------------------------------------------------------

create or replace function public.admin_delete_person(p_email text) returns text
language plpgsql security definer set search_path = public as $$
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
revoke execute on function public.admin_delete_person(text) from public, anon;
grant execute on function public.admin_delete_person(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Rooms: rename and archive
-- ---------------------------------------------------------------------------

alter table public.rooms add column if not exists archived boolean not null default false;

create or replace function public.admin_rename_room(p_room text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
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
revoke execute on function public.admin_rename_room(text, text) from public, anon;
grant execute on function public.admin_rename_room(text, text) to authenticated;

-- Archive only a room with nothing coming up: no classes from tomorrow and no future bookings
create or replace function public.admin_archive_room(p_room text, p_archived boolean) returns void
language plpgsql security definer set search_path = public as $$
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
revoke execute on function public.admin_archive_room(text, boolean) from public, anon;
grant execute on function public.admin_archive_room(text, boolean) to authenticated;

-- The day's schedule leaves archived rooms out (otherwise as in 0020)
create or replace function public.get_day_schedule(p_date date)
returns table (
  room_id       text,
  room_name     text,
  slot_id       smallint,
  slot_label    text,
  starts        time,
  ends          time,
  status        text,      -- free | class | department | booked | cie | event | closed
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
   and t.weekday = public.day_order(p_date)
   and not exists (select 1 from public.holidays h where h.date = p_date)
  left join latest l on l.room_id = r.id and l.slot_id = s.id
  where extract(isodow from p_date) between 1 and 6
    and not r.archived
  order by s.starts, r.sort_order, r.id
$$;


-- ---------------------------------------------------------------------------
-- 9. Subjects
-- ---------------------------------------------------------------------------

create or replace function public.admin_rename_subject(p_email text, p_old text, p_new text) returns void
language plpgsql security definer set search_path = public as $$
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
revoke execute on function public.admin_rename_subject(text, text, text) from public, anon;
grant execute on function public.admin_rename_subject(text, text, text) to authenticated;

-- 1. Back-to-back exchange: a class, lab or tutorial that runs over two or more slots in a row
--    (same room, same subject) is handed over as ONE request. The colleague must be free in
--    every slot, accepts or declines once, and the admin approves or denies all slots together.
--    class_exchanges.slot_ids holds every slot; slot_id stays the first one, so older pages and
--    single-slot requests work as before.
--    When the colleague teaches their own subject to the same class, the slot is mapped to that
--    subject (e.g. COA-3E by them in place of DPM-3E), so home, Class changes and the report show
--    what the students actually have.
-- 2. Denying keeps the original classes: rejecting never touches the timetable (unchanged), and
--    an admin can now also take back an approval before the class starts, which gives every
--    slot back to the original faculty member.
-- 3. CIE days: cancel every regular class of the chosen semesters on a day, in one go. Each
--    class is dropped with the reason "Cancelled for CIE: …", so the home page, class changes,
--    free slots and the report all show it, and an admin can restore a slot from Allot / free rooms.
-- Depends on 0029.

alter table public.class_exchanges add column if not exists slot_ids int[];
update public.class_exchanges set slot_ids = array[slot_id] where slot_ids is null;

-- Every slot of an exchange, first to last
create or replace function public.exchange_slots(x public.class_exchanges) returns int[]
language sql immutable as $$
  select coalesce(x.slot_ids, array[x.slot_id])
$$;

-- p_slots in time order, or null if they are not back to back (no other slot between them)
create or replace function public.consecutive_slots(p_slots int[]) returns int[]
language sql stable set search_path = public as $$
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

-- ---------------------------------------------------------------------------
-- 1. Ask a colleague to take a class over one or more back-to-back slots
-- ---------------------------------------------------------------------------

create or replace function public.request_exchange_slots(p_room text, p_date date, p_slots int[], p_target text, p_note text default '', p_new_subject text default null)
returns bigint language plpgsql security definer set search_path = public as $$
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
end $$;

-- The one-slot version from 0029, kept for any page still calling it
create or replace function public.request_exchange(p_room text, p_date date, p_slot int, p_target text, p_note text default '', p_new_subject text default null)
returns bigint language sql security definer set search_path = public as $$
  select public.request_exchange_slots(p_room, p_date, array[p_slot], p_target, p_note, p_new_subject)
$$;

-- ---------------------------------------------------------------------------
-- 2. The colleague accepts or declines (free in every slot to accept)
-- ---------------------------------------------------------------------------

create or replace function public.respond_exchange(p_id bigint, p_accept boolean, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
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

-- ---------------------------------------------------------------------------
-- 3. Admin approves every slot, or denies (nothing on the timetable changes)
-- ---------------------------------------------------------------------------

create or replace function public.admin_decide_exchange(p_id bigint, p_approve boolean, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
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

-- An approval taken back before the class starts: each slot goes back to what it was before
-- the exchange (the regular class, or the requester's own booking), and the request shows as denied.
create or replace function public.admin_undo_exchange(p_id bigint, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
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

-- ---------------------------------------------------------------------------
-- 4. CIE days: cancel the regular classes of some semesters
-- ---------------------------------------------------------------------------

-- The semesters a subject is taught to: "DBMS-3B" → {3}, "KDD-5" → {5}, "DBMS-3B/3C" → {3}
create or replace function public.subject_semesters(p_subject text) returns text[]
language sql immutable as $$
  select coalesce(array_agg(distinct left(k, 1)), '{}')
  from (select upper(btrim(k)) as k
          from regexp_split_to_table(coalesce(substring(p_subject from '-([^-]*)$'), ''), '[/,&]') as k) t
  where k ~ '^\d[A-Z]?$'
$$;

-- Drops every class (regular or a class booking) of the chosen semesters on a day, in slots
-- that have not started yet. Returns how many slots were cancelled.
create or replace function public.admin_cancel_semester_classes(p_date date, p_semesters text[], p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  d record;
  v_n int := 0;
  v_reason text := 'Cancelled for CIE: ' || coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'semester ' || array_to_string(p_semesters, ', '));
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

grant execute on function public.exchange_slots(public.class_exchanges) to anon, authenticated;
grant execute on function public.consecutive_slots(int[]) to anon, authenticated;
grant execute on function public.subject_semesters(text) to anon, authenticated;
revoke execute on function public.request_exchange_slots(text, date, int[], text, text, text) from public, anon;
grant execute on function public.request_exchange_slots(text, date, int[], text, text, text) to authenticated;
revoke execute on function public.request_exchange(text, date, int, text, text, text) from public, anon;
grant execute on function public.request_exchange(text, date, int, text, text, text) to authenticated;
revoke execute on function public.respond_exchange(bigint, boolean, text) from public, anon;
grant execute on function public.respond_exchange(bigint, boolean, text) to authenticated;
revoke execute on function public.admin_decide_exchange(bigint, boolean, text) from public, anon;
grant execute on function public.admin_decide_exchange(bigint, boolean, text) to authenticated;
revoke execute on function public.admin_undo_exchange(bigint, text) from public, anon;
grant execute on function public.admin_undo_exchange(bigint, text) to authenticated;
revoke execute on function public.admin_cancel_semester_classes(date, text[], text) from public, anon;
grant execute on function public.admin_cancel_semester_classes(date, text[], text) to authenticated;

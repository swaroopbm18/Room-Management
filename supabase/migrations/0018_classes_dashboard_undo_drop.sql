-- Class timetables for students, a faster faculty dashboard, and faculty undoing a dropped
-- class. Depends on 0007 and 0003.

-- Students see each class's week on the Class timetables page without signing in. The regular
-- timetable is already public through the home page; this lets the page read it whole.
grant execute on function public.get_timetable_all(date) to anon;

-- The signed-in faculty member's classes and bookings from one date to another, in one call
-- instead of one per day.
create or replace function public.my_schedule(p_from date, p_to date)
returns table (date date, room_id text, room_name text, slot_id smallint, slot_label text, status text, subject text, ended boolean)
language sql stable security definer set search_path = public as $$
  select d::date, s.room_id, s.room_name, s.slot_id, s.slot_label, s.status, s.subject, s.ended
  from generate_series(p_from, least(p_to, p_from + 31), interval '1 day') d
  cross join lateral public.get_day_schedule(d::date) s
  where s.is_mine
  order by d, s.starts, s.room_id
$$;
grant execute on function public.my_schedule(date, date) to authenticated;

-- Undo a class the signed-in faculty member dropped, before the slot starts, as long as nothing
-- else has happened to the slot since. The slot goes back to what it was before the drop (the
-- regular class, or their booking), and pending requests for it are declined.
create or replace function public.undo_drop(p_room text, p_date date, p_slot int)
returns void language plpgsql security definer set search_path = public as $$
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
grant execute on function public.undo_drop(text, date, int) to authenticated;

-- 1. Event requests no longer need an approval letter to be sent. The form still asks for one,
--    and the admin sees when it is missing and can reject the request. A letter that is
--    attached is still checked (own upload, PDF, under 5 MB).
-- 2. Admins can rename a booked slot (approved class or event, CIE, college event): the
--    name shown in the timetable. The rename covers the whole booking, i.e. the slots next
--    to it in the same room and day with the same booking, and is logged like any change.

alter table public.requests drop constraint if exists requests_check;

create or replace function public.create_group_request(
  p_room text, p_date date, p_slots int[],
  p_type public.request_type, p_description text, p_pdf_path text default null,
  p_subject text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
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

revoke execute on function public.create_group_request(text, date, int[], public.request_type, text, text, text) from public, anon;
grant execute on function public.create_group_request(text, date, int[], public.request_type, text, text, text) to authenticated;

create or replace function public.admin_rename_booking(p_room text, p_date date, p_slot int, p_title text)
returns int language plpgsql security definer set search_path = public as $$
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

revoke execute on function public.admin_rename_booking(text, date, int, text) from public, anon;
grant execute on function public.admin_rename_booking(text, date, int, text) to authenticated;

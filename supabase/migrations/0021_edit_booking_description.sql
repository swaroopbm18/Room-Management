-- Admins can change a booking's description as well as its name.
-- Like admin_rename_booking (0011), the change covers the whole booking: every back-to-back slot
-- of the same booking in that room on that day that hasn't ended. A gap starts a new booking.
-- The old rows are kept: the edit adds new allotment rows, so the history stays permanent.
-- Depends on 0011.

create or replace function public.admin_edit_booking(p_room text, p_date date, p_slot int, p_title text, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
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

revoke execute on function public.admin_edit_booking(text, date, int, text, text) from public, anon;
grant execute on function public.admin_edit_booking(text, date, int, text, text) to authenticated;

-- Upcoming events, CIEs and booked slots for the home page: every room and slot from now to
-- p_days ahead whose latest allotment is an approved request or an admin allotment. Shows the
-- same details as the public day schedule, so it is readable without signing in.

create or replace function public.upcoming_bookings(p_days int default 14)
returns table (
  date         date,
  room_id      text,
  slot_id      smallint,
  kind         public.allotment_kind,
  title        text,
  faculty_name text,
  reason       text
)
language sql stable security definer set search_path = public as $$
  select l.date, l.room_id, l.slot_id, l.kind, l.title, l.faculty_name, l.reason
  from (
    select distinct on (a.date, a.room_id, a.slot_id) a.*
    from public.allotments a
    where a.date between public.ist_today() and public.ist_today() + least(greatest(p_days, 0), 31)
    order by a.date, a.room_id, a.slot_id, a.id desc
  ) l
  where l.kind in ('class_request', 'event_request', 'cie', 'event')
    and not public.slot_has_ended(l.date, l.slot_id)
  order by l.date, l.slot_id, l.room_id
$$;

grant execute on function public.upcoming_bookings(int) to anon, authenticated;

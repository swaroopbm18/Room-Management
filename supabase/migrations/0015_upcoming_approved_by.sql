-- Upcoming bookings also say which admin approved or allotted each slot, so the home page
-- can show "Approved by ..." on its own line. For an approved request that is the admin who
-- approved it; for a CIE or event it is the admin who allotted (or last renamed) it.

drop function if exists public.upcoming_bookings(int);

create or replace function public.upcoming_bookings(p_days int default 14)
returns table (
  date         date,
  room_id      text,
  slot_id      smallint,
  kind         public.allotment_kind,
  title        text,
  faculty_name text,
  reason       text,
  approved_by  text
)
language sql stable security definer set search_path = public as $$
  select l.date, l.room_id, l.slot_id, l.kind, l.title, l.faculty_name, l.reason,
         coalesce(public.display_name(p), l.approver)
  from (
    select distinct on (a.date, a.room_id, a.slot_id) a.*, coalesce(r.decided_by, a.created_by) as approver
    from public.allotments a
    left join public.requests r on r.id = a.request_id
    where a.date between public.ist_today() and public.ist_today() + least(greatest(p_days, 0), 31)
    order by a.date, a.room_id, a.slot_id, a.id desc
  ) l
  left join public.people p on p.email = l.approver
  where l.kind in ('class_request', 'event_request', 'cie', 'event')
    and not public.slot_has_ended(l.date, l.slot_id)
  order by l.date, l.slot_id, l.room_id
$$;

grant execute on function public.upcoming_bookings(int) to anon, authenticated;

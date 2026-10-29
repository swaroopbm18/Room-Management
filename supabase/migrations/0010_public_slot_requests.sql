-- Requests for a room's slot are public: anyone who opens a slot sees who has asked for it,
-- for what, and where each request stands. Email addresses, letters and the admin's decision
-- note stay private; withdrawn requests are left out.

create or replace function public.slot_requests(p_room text, p_from date, p_to date)
returns table (
  id             uuid,
  room_id        text,
  date           date,
  slot_id        smallint,
  requester_name text,
  type           public.request_type,
  subject        text,
  description    text,
  status         public.request_status,
  created_at     timestamptz,
  decided_at     timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.room_id, r.date, r.slot_id, r.requester_name, r.type, r.subject, r.description,
         r.status, r.created_at, r.decided_at
  from public.requests r
  where (p_room is null or r.room_id = p_room)
    and r.date between p_from and least(p_to, p_from + 31)
    and r.status <> 'withdrawn'
  order by r.date, r.slot_id, r.room_id, (r.status = 'pending') desc, r.priority, r.created_at
$$;

grant execute on function public.slot_requests(text, date, date) to anon, authenticated;

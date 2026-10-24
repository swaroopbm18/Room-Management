-- Multi-slot requests: one request can cover several consecutive slots in the same room on
-- the same day (a double class or a half-day event). Each slot is still its own row, so all
-- per-slot rules keep working; rows of one request share a group_id and are always
-- approved, rejected or withdrawn together.

alter table public.requests add column group_id uuid;
update public.requests set group_id = id where group_id is null;
alter table public.requests alter column group_id set not null;
alter table public.requests alter column group_id set default gen_random_uuid();
create index on public.requests (group_id);

-- group_id joins the columns that can never change.
create or replace function public.requests_guard_update() returns trigger
language plpgsql as $$
begin
  if public.slot_has_ended(old.date, old.slot_id) then
    raise exception 'This slot has already ended; past requests cannot be changed'
      using errcode = 'P0001';
  end if;
  if (new.room_id, new.date, new.slot_id, new.requester_email, new.requester_name,
      new.type, new.description, new.pdf_path, new.created_at, new.id, new.group_id)
     is distinct from
     (old.room_id, old.date, old.slot_id, old.requester_email, old.requester_name,
      old.type, old.description, old.pdf_path, old.created_at, old.id, old.group_id) then
    raise exception 'Only the status and priority of a request can change'
      using errcode = 'P0001';
  end if;
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'This request has already been decided' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Creating
-- ---------------------------------------------------------------------------

create or replace function public.create_group_request(
  p_room text, p_date date, p_slots int[],
  p_type public.request_type, p_description text, p_pdf_path text default null
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
  if p_type = 'event' then
    if p_pdf_path is null or split_part(p_pdf_path, '/', 1) <> me.email then
      raise exception 'An event request needs the approval letter as a PDF' using errcode = 'P0001';
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
                               type, description, pdf_path, priority, group_id)
  select p_room, p_date, s, me.email, public.display_name(me), p_type, btrim(p_description),
         p_pdf_path, v_priority, v_group
    from unnest(p_slots) as s;
  return v_group;
end $$;

-- The single-slot version is kept for compatibility.
create or replace function public.create_request(
  p_room text, p_date date, p_slot int,
  p_type public.request_type, p_description text, p_pdf_path text default null
) returns uuid
language sql security definer set search_path = public as $$
  select public.create_group_request(p_room, p_date, array[p_slot], p_type, p_description, p_pdf_path)
$$;

-- ---------------------------------------------------------------------------
-- Deciding: always the whole request (every slot in its group)
-- ---------------------------------------------------------------------------

-- Decline every other pending request that wants any of these slots. A multi-slot request
-- that loses even one slot is declined as a whole.
create or replace function public.reject_others(p_room text, p_date date, p_slot int,
                                                p_except uuid, p_note text, p_by text)
returns void language sql security definer set search_path = public as $$
  update public.requests
     set status = 'rejected', decided_by = p_by, decided_at = now(), decision_note = p_note
   where status = 'pending'
     and group_id in (select q.group_id from public.requests q
                       where q.room_id = p_room and q.date = p_date and q.slot_id = p_slot
                         and q.status = 'pending')
     and group_id is distinct from p_except
$$;

create or replace function public.approve_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
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
            case r.type when 'class' then 'Class' else 'Event' end,
            r.requester_email, r.requester_name, r.description, r.id, me.email);
    perform public.reject_others(r.room_id, r.date, r.slot_id, v_group,
                                 'Another request was approved for this slot', me.email);
  end loop;
end $$;

create or replace function public.reject_request(p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
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

create or replace function public.withdraw_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.requests set status = 'withdrawn', decided_at = now(), decided_by = public.current_email()
   where requester_email = public.current_email() and status = 'pending'
     and group_id = (select group_id from public.requests where id = p_id or group_id = p_id limit 1);
  if not found then
    raise exception 'Request not found or already decided' using errcode = 'P0001';
  end if;
end $$;

-- Move a request up (-1) or down (+1) among pending requests for the same room and day.
create or replace function public.move_request(p_id uuid, p_dir int) returns void
language plpgsql security definer set search_path = public as $$
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

-- Overrides now decline whole multi-slot requests that lose a slot (reject_others above).
create or replace function public.admin_override(
  p_room text, p_date date, p_slot int, p_kind public.allotment_kind, p_title text, p_reason text
) returns void language plpgsql security definer set search_path = public as $$
declare me public.people := public.require_admin();
begin
  if p_kind not in ('cie', 'event') then
    raise exception 'Allotments can only be changed for a CIE or an event' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Please add a description' using errcode = 'P0001';
  end if;
  perform public.booking_window_check(p_date, p_slot);
  insert into public.allotments (room_id, date, slot_id, kind, title, faculty_email, faculty_name, reason, created_by)
  values (p_room, p_date, p_slot, p_kind,
          coalesce(nullif(btrim(p_title), ''), case p_kind when 'cie' then 'CIE' else 'Event' end),
          me.email, public.display_name(me), btrim(p_reason), me.email);
  perform public.reject_others(p_room, p_date, p_slot, null,
                               'Slot taken for a ' || upper(p_kind::text), me.email);
end $$;

revoke execute on function public.create_group_request(text, date, int[], public.request_type, text, text) from public, anon;
grant execute on function public.create_group_request(text, date, int[], public.request_type, text, text) to authenticated;
revoke execute on function public.reject_others(text, date, int, uuid, text, text) from public, anon, authenticated;

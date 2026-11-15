-- Class exchange: a faculty member asks a colleague who is free to take one of their classes.
--   1. The requester picks a class of theirs still to come and a colleague free in that slot.
--   2. The colleague sees it under "Exchange requests" and accepts or declines it.
--   3. Admins see every exchange from the moment it is sent, and give the final approval once
--      the colleague has accepted (or reject it at any point).
--   4. On approval the slot is allotted as a class taken by the colleague (the same booking an
--      admin makes for a class or a substitute), so every page, the colleague's dashboard, free
--      and busy faculty and calendar feeds show the change, and the requester is freed.
-- Depends on 0026 (admin_override with faculty initials).

create table if not exists public.class_exchanges (
  id               bigserial primary key,
  room_id          text not null references public.rooms (id),
  date             date not null,
  slot_id          int  not null references public.slots (id),
  subject          text,                 -- the class being handed over, e.g. DBMS-3A
  new_subject      text,                 -- what the colleague will teach then (their own subject for the class, or the same)
  requester_email  text not null,
  requester_name   text not null,
  requester_initials text,
  target_initials  text not null,
  target_email     text not null,
  target_name      text not null,
  note             text not null default '',
  status           text not null default 'pending'
                   check (status in ('pending', 'accepted', 'declined', 'approved', 'rejected', 'withdrawn')),
  response_note    text,
  responded_at     timestamptz,
  decided_by       text,
  decision_note    text,
  decided_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists class_exchanges_requester on public.class_exchanges (requester_email, date desc);
create index if not exists class_exchanges_target on public.class_exchanges (target_email, date desc);
create index if not exists class_exchanges_open on public.class_exchanges (status, date);

alter table public.class_exchanges enable row level security;
drop policy if exists "people in an exchange and admins read it" on public.class_exchanges;
create policy "people in an exchange and admins read it" on public.class_exchanges for select
  using (requester_email = public.current_email() or target_email = public.current_email() or public.is_admin());
grant select on public.class_exchanges to authenticated;
-- Every change goes through the functions below

-- Who is free in a slot on a date, from the same rules as free and busy faculty
create or replace function public.faculty_free_at(p_initials text, p_date date, p_slot int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.faculty_status(p_date) f where f.initials = p_initials and f.slot_id = p_slot and not f.busy)
$$;

-- Initials of everyone on the sign-in list, so the exchange page can say who can accept a
-- request (faculty can only read their own row of people)
create or replace function public.signed_up_initials() returns setof text
language sql stable security definer set search_path = public as $$
  select initials from public.people where active and initials is not null and public.is_staff()
$$;

-- The class has started (or ended): nothing about it can be exchanged any more
create or replace function public.slot_has_started(p_date date, p_slot int) returns boolean
language sql stable as $$
  select public.slot_has_ended(p_date, p_slot)
      or (p_date = public.ist_today() and (select starts from public.slots where id = p_slot) <= public.ist_now()::time)
$$;

-- ---------------------------------------------------------------------------
-- 1. Ask a colleague to take a class
-- ---------------------------------------------------------------------------

create or replace function public.request_exchange(p_room text, p_date date, p_slot int, p_target text, p_note text default '', p_new_subject text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.current_person();
  st record;
  v_target public.people;
  v_ini text := upper(btrim(coalesce(p_target, '')));
  v_id bigint;
begin
  if me.email is null then
    raise exception 'Only registered faculty can ask for a class exchange' using errcode = '42501';
  end if;
  if public.slot_has_started(p_date, p_slot) then
    raise exception 'This class has already started' using errcode = 'P0001';
  end if;
  select d.status, d.is_mine, d.subject into st from public.get_day_schedule(p_date) d where d.room_id = p_room and d.slot_id = p_slot;
  if st.status is null or st.status not in ('class', 'booked') or not st.is_mine then
    raise exception 'You can only hand over a class that is yours' using errcode = 'P0001';
  end if;
  select * into v_target from public.people where initials = v_ini and active limit 1;
  if v_target.email is null then
    raise exception 'That faculty member has not signed in to the site yet, so they can''t accept a request. Ask an admin to assign them as a substitute instead.' using errcode = 'P0001';
  end if;
  if v_target.email = me.email then
    raise exception 'Pick someone other than yourself' using errcode = 'P0001';
  end if;
  if not public.faculty_free_at(v_ini, p_date, p_slot) then
    raise exception '% is not free in that slot', public.display_name(v_target) using errcode = 'P0001';
  end if;
  if exists (select 1 from public.class_exchanges
              where room_id = p_room and date = p_date and slot_id = p_slot
                and status in ('pending', 'accepted')) then
    raise exception 'This class already has an exchange request waiting. Withdraw it first to ask someone else.' using errcode = 'P0001';
  end if;

  insert into public.class_exchanges (room_id, date, slot_id, subject, new_subject, requester_email, requester_name, requester_initials,
                                      target_initials, target_email, target_name, note)
  values (p_room, p_date, p_slot, st.subject, coalesce(nullif(btrim(coalesce(p_new_subject, '')), ''), st.subject),
          me.email, public.display_name(me), me.initials,
          v_ini, v_target.email, public.display_name(v_target), left(btrim(coalesce(p_note, '')), 300))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The colleague accepts or declines
-- ---------------------------------------------------------------------------

create or replace function public.respond_exchange(p_id bigint, p_accept boolean, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.current_person();
  x public.class_exchanges;
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
  if p_accept and not public.faculty_free_at(x.target_initials, x.date, x.slot_id) then
    raise exception 'You are no longer free in that slot' using errcode = 'P0001';
  end if;
  update public.class_exchanges
     set status = case when p_accept then 'accepted' else 'declined' end,
         response_note = nullif(left(btrim(coalesce(p_note, '')), 300), ''),
         responded_at = now()
   where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The requester withdraws (before the admin decides)
-- ---------------------------------------------------------------------------

create or replace function public.withdraw_exchange(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
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

-- ---------------------------------------------------------------------------
-- 4. Admins give the final approval (after the colleague accepts) or reject
-- ---------------------------------------------------------------------------

create or replace function public.admin_decide_exchange(p_id bigint, p_approve boolean, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  x public.class_exchanges;
  st record;
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
    -- The class must still be the requester's, and the colleague still free
    select d.status, d.subject into st from public.get_day_schedule(x.date) d where d.room_id = x.room_id and d.slot_id = x.slot_id;
    if st.status is null or st.status not in ('class', 'booked') or st.subject is distinct from x.subject then
      raise exception 'The class in that slot has changed since the request was sent' using errcode = 'P0001';
    end if;
    if not public.faculty_free_at(x.target_initials, x.date, x.slot_id) then
      raise exception '% is no longer free in that slot', x.target_name using errcode = 'P0001';
    end if;
    perform public.admin_override(x.room_id, x.date, x.slot_id, 'class_request',
      coalesce(x.new_subject, x.subject, 'Class'),
      'Class exchange: ' || x.target_name || ' takes ' || coalesce(x.subject, 'the class') || ' for ' || x.requester_name,
      x.target_initials);
  end if;
  update public.class_exchanges
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = me.email,
         decision_note = nullif(left(btrim(coalesce(p_note, '')), 300), ''),
         decided_at = now()
   where id = p_id;
end $$;

revoke execute on function public.faculty_free_at(text, date, int) from public, anon;
grant execute on function public.faculty_free_at(text, date, int) to authenticated;
grant execute on function public.slot_has_started(date, int) to anon, authenticated;
revoke execute on function public.signed_up_initials() from public, anon;
grant execute on function public.signed_up_initials() to authenticated;
revoke execute on function public.request_exchange(text, date, int, text, text, text) from public, anon;
grant execute on function public.request_exchange(text, date, int, text, text, text) to authenticated;
revoke execute on function public.respond_exchange(bigint, boolean, text) from public, anon;
grant execute on function public.respond_exchange(bigint, boolean, text) to authenticated;
revoke execute on function public.withdraw_exchange(bigint) from public, anon;
grant execute on function public.withdraw_exchange(bigint) to authenticated;
revoke execute on function public.admin_decide_exchange(bigint, boolean, text) from public, anon;
grant execute on function public.admin_decide_exchange(bigint, boolean, text) to authenticated;

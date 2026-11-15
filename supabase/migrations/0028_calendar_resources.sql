-- 1. Calendar sync: each faculty member gets a private link (a calendar feed) that Google
--    Calendar, Outlook or an iPhone subscribes to. It lists their classes and bookings for the
--    coming weeks, make-up Sundays included, and stays up to date by itself.
-- 2. Resource requests: faculty ask for supplies (markers, cables, batteries) or anything else
--    (a lab, an AV setup) for a date; an admin approves or declines, like a room request.
--    Supplies have a stock count, and approving a request takes it out of stock.
-- Depends on 0027.

-- ---------------------------------------------------------------------------
-- 1. Calendar feeds
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_feeds (
  email      text primary key references public.people(email) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);
-- Read and written only through the functions below: the token is a password
alter table public.calendar_feeds enable row level security;

create or replace function public.new_feed_token() returns text
language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

-- The signed-in faculty member's feed token, made the first time it is asked for
create or replace function public.my_calendar_token() returns text
language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.current_person();
  v_token text;
begin
  if me.email is null or not me.active then
    raise exception 'Only registered faculty have a calendar link' using errcode = '42501';
  end if;
  insert into public.calendar_feeds (email, token) values (me.email, public.new_feed_token())
  on conflict (email) do nothing;
  select token into v_token from public.calendar_feeds where email = me.email;
  return v_token;
end $$;
revoke execute on function public.my_calendar_token() from public, anon;
grant execute on function public.my_calendar_token() to authenticated;

-- A new link; the old one stops working (e.g. it was shared by mistake)
create or replace function public.reset_calendar_token() returns text
language plpgsql security definer set search_path = public as $$
declare me public.people := public.current_person();
begin
  if me.email is null or not me.active then
    raise exception 'Only registered faculty have a calendar link' using errcode = '42501';
  end if;
  delete from public.calendar_feeds where email = me.email;
  return public.my_calendar_token();
end $$;
revoke execute on function public.reset_calendar_token() from public, anon;
grant execute on function public.reset_calendar_token() to authenticated;

-- What a feed shows: the owner's classes and bookings from a week back to four weeks ahead.
-- Called by the calendar app with the token alone (no sign-in), so it reads as that person.
create or replace function public.calendar_feed(p_token text)
returns table (date date, room_id text, room_name text, slot_id smallint, starts time, ends time, status text, subject text, faculty_name text, reason text, owner text)
language plpgsql stable security definer set search_path = public set jit = off as $$
declare
  v_email text;
  v_name text;
begin
  select f.email, public.display_name(p) into v_email, v_name
    from public.calendar_feeds f join public.people p on p.email = f.email and p.active
   where f.token = p_token and length(p_token) >= 32;
  if v_email is null then
    return;
  end if;
  -- get_day_schedule marks "mine" from the request's email: answer as the feed's owner
  perform set_config('request.jwt.claims', json_build_object('email', v_email)::text, true);
  return query
    select d::date, s.room_id, s.room_name, s.slot_id, s.starts, s.ends, s.status, s.subject, s.faculty_name, s.reason, v_name
    from generate_series(public.ist_today() - 7, public.ist_today() + 28, interval '1 day') d
    cross join lateral public.get_day_schedule(d::date) s
    where s.is_mine
    order by 1, s.starts, s.room_id;
end $$;
revoke execute on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Supplies and resource requests
-- ---------------------------------------------------------------------------

create table if not exists public.supplies (
  id         serial primary key,
  name       text not null unique check (length(btrim(name)) between 1 and 60),
  unit       text not null default 'pcs' check (length(btrim(unit)) between 1 and 20),
  stock      int not null default 0 check (stock >= 0),
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.supplies enable row level security;
drop policy if exists "staff read supplies" on public.supplies;
create policy "staff read supplies" on public.supplies for select using (public.is_staff());
grant select on public.supplies to authenticated;

do $$ begin
  create type public.resource_status as enum ('pending', 'approved', 'declined', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.resource_requests (
  id              bigserial primary key,
  requester_email text not null,
  requester_name  text not null,
  supply_id       int references public.supplies(id),
  item            text not null check (length(btrim(item)) between 1 and 80),
  quantity        int not null check (quantity between 1 and 1000),
  needed_on       date not null,
  room_id         text references public.rooms(id),
  purpose         text not null check (length(btrim(purpose)) between 5 and 300),
  status          public.resource_status not null default 'pending',
  decided_by      text,
  decided_at      timestamptz,
  decision_note   text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists resource_requests_pending on public.resource_requests (needed_on) where status = 'pending';
create index if not exists resource_requests_requester on public.resource_requests (requester_email, id desc);
alter table public.resource_requests enable row level security;
drop policy if exists "own or admin reads resource requests" on public.resource_requests;
create policy "own or admin reads resource requests" on public.resource_requests for select
  using (requester_email = public.current_email() or public.is_admin());
grant select on public.resource_requests to authenticated;

create or replace function public.admin_save_supply(p_id int, p_name text, p_unit text, p_stock int, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me public.people := public.require_admin();
begin
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Name the item, e.g. Whiteboard markers' using errcode = 'P0001';
  end if;
  if p_stock is null or p_stock < 0 then
    raise exception 'Stock can''t be below zero' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.supplies (name, unit, stock, active)
    values (btrim(p_name), coalesce(nullif(btrim(p_unit), ''), 'pcs'), p_stock, coalesce(p_active, true));
  else
    update public.supplies set name = btrim(p_name), unit = coalesce(nullif(btrim(p_unit), ''), 'pcs'), stock = p_stock,
           active = coalesce(p_active, true), updated_at = now()
     where id = p_id;
    if not found then
      raise exception 'That item was removed' using errcode = 'P0001';
    end if;
  end if;
exception when unique_violation then
  raise exception 'There is already an item called %', btrim(p_name) using errcode = 'P0001';
end $$;
revoke execute on function public.admin_save_supply(int, text, text, int, boolean) from public, anon;
grant execute on function public.admin_save_supply(int, text, text, int, boolean) to authenticated;

-- A faculty member asks for a supply from stock (p_supply) or for anything else (p_item)
create or replace function public.request_resource(p_supply int, p_item text, p_qty int, p_date date, p_room text, p_purpose text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.current_person();
  s public.supplies;
  v_id bigint;
begin
  if me.email is null or not me.active then
    raise exception 'Only registered faculty can request resources' using errcode = '42501';
  end if;
  if p_date is null or p_date < public.ist_today() then
    raise exception 'Pick today or a later date' using errcode = 'P0001';
  end if;
  if p_date > public.ist_today() + 60 then
    raise exception 'Resources can be requested up to two months ahead' using errcode = 'P0001';
  end if;
  if coalesce(p_qty, 0) < 1 then
    raise exception 'Ask for at least one' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_purpose, ''))) < 5 then
    raise exception 'Say what it is for' using errcode = 'P0001';
  end if;
  if p_supply is not null then
    select * into s from public.supplies where id = p_supply and active;
    if s.id is null then
      raise exception 'That item can''t be requested' using errcode = 'P0001';
    end if;
    if p_qty > s.stock then
      raise exception 'Only % % of % in stock', s.stock, s.unit, s.name using errcode = 'P0001';
    end if;
  elsif length(btrim(coalesce(p_item, ''))) = 0 then
    raise exception 'Say what you need, e.g. Lab 2 with 30 systems' using errcode = 'P0001';
  end if;
  insert into public.resource_requests (requester_email, requester_name, supply_id, item, quantity, needed_on, room_id, purpose)
  values (me.email, public.display_name(me), s.id, coalesce(s.name, btrim(p_item)), p_qty, p_date, nullif(p_room, ''), btrim(p_purpose))
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.request_resource(int, text, int, date, text, text) from public, anon;
grant execute on function public.request_resource(int, text, int, date, text, text) to authenticated;

-- Withdraw your own request while it is still pending
create or replace function public.cancel_resource_request(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.resource_requests set status = 'cancelled', decided_at = now(), decided_by = public.current_email()
   where id = p_id and status = 'pending' and requester_email = public.current_email();
  if not found then
    raise exception 'That request was already decided or withdrawn' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function public.cancel_resource_request(bigint) from public, anon;
grant execute on function public.cancel_resource_request(bigint) to authenticated;

-- Approve (taking a supply out of stock) or decline, with an optional note to the requester
create or replace function public.admin_decide_resource(p_id bigint, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  r public.resource_requests;
  s public.supplies;
begin
  select * into r from public.resource_requests where id = p_id for update;
  if r.id is null or r.status <> 'pending' then
    raise exception 'That request was already decided or withdrawn' using errcode = 'P0001';
  end if;
  if p_approve and r.supply_id is not null then
    update public.supplies set stock = stock - r.quantity, updated_at = now()
     where id = r.supply_id and stock >= r.quantity
    returning * into s;
    if s.id is null then
      select * into s from public.supplies where id = r.supply_id;
      raise exception 'Only % % of % left in stock. Update the stock or decline.', coalesce(s.stock, 0), coalesce(s.unit, ''), r.item using errcode = 'P0001';
    end if;
  end if;
  update public.resource_requests
     set status = case when p_approve then 'approved'::public.resource_status else 'declined'::public.resource_status end,
         decided_by = me.email, decided_at = now(), decision_note = btrim(coalesce(p_note, ''))
   where id = p_id;
end $$;
revoke execute on function public.admin_decide_resource(bigint, boolean, text) from public, anon;
grant execute on function public.admin_decide_resource(bigint, boolean, text) to authenticated;

-- In the activity log like everything else admins change
do $$
declare t text;
begin
  foreach t in array array['supplies', 'resource_requests'] loop
    execute format('drop trigger if exists log_activity on public.%I', t);
    execute format('create trigger log_activity after insert or update or delete on public.%I
                    for each row execute function public.log_activity()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Day swaps on past dates, for the records (e.g. a Saturday that ran Monday's classes last
--    month). Admins only, as before; a past date must fall in a semester. The day's schedule,
--    history and report then show that weekday's classes.
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_day_order(p_date date, p_follows int, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare me public.people := public.require_admin();
begin
  if p_date is null then
    raise exception 'Pick a date' using errcode = 'P0001';
  end if;
  if p_date < public.ist_today()
     and not exists (select 1 from public.timetable_versions where p_date between valid_from and valid_to) then
    raise exception 'That date is outside every semester' using errcode = 'P0001';
  end if;
  if p_follows is null or p_follows = extract(isodow from p_date) then
    delete from public.day_orders where date = p_date;
    return;
  end if;
  if p_follows not between 1 and 6 then
    raise exception 'Pick a weekday from Monday to Saturday' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.holidays where date = p_date) then
    raise exception 'That day is a holiday. Remove the holiday first, or pick another day.' using errcode = 'P0001';
  end if;
  insert into public.day_orders (date, follows, note, created_by) values (p_date, p_follows, btrim(coalesce(p_note, '')), me.email)
  on conflict (date) do update set follows = excluded.follows, note = excluded.note, created_by = excluded.created_by, created_at = now();
end $$;
revoke execute on function public.admin_set_day_order(date, int, text) from public, anon;
grant execute on function public.admin_set_day_order(date, int, text) to authenticated;

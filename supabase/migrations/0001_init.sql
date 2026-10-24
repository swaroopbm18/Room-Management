-- Room Management: schema, immutability rules, row-level security and RPCs.
-- All times are IST (Asia/Kolkata). A slot is "past" once its end time has passed.
-- Allotment history is append-only: no row in allotments can ever be updated or deleted,
-- and nothing can be inserted for a slot that has already ended.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

create table public.rooms (
  id         text primary key,          -- e.g. 'MEL-CR-01'
  name       text not null,
  sort_order int  not null default 0
);

create table public.slots (
  id       smallint primary key,
  starts   time not null,
  ends     time not null check (ends > starts),
  label    text not null                -- e.g. '11:15 AM – 12:10 PM'
);

create type public.app_role as enum ('admin', 'faculty');

create table public.people (
  email      text primary key check (email = lower(email) and email like '%@bmsce.ac.in'),
  full_name  text not null,
  initials   text unique,               -- as written in the timetable, e.g. 'AKN'
  title      text,                      -- 'Prof.' / 'Dr.'
  role       public.app_role not null default 'faculty',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- The default weekly timetable. A revision is a new version; old versions are never edited,
-- so past days keep showing the timetable that applied on that day.
create table public.timetable_versions (
  id         serial primary key,
  name       text not null,
  valid_from date not null,
  valid_to   date not null check (valid_to >= valid_from),
  created_at timestamptz not null default now()
);

create table public.timetable_entries (
  id               bigserial primary key,
  version_id       int not null references public.timetable_versions(id),
  room_id          text not null references public.rooms(id),
  weekday          smallint not null check (weekday between 1 and 6),  -- ISO: 1 = Monday
  slot_id          smallint not null references public.slots(id),
  subject          text not null,            -- 'DBMS-3B', or a department such as 'CSE'
  faculty_initials text[] not null default '{}',
  faculty_label    text not null default '', -- as written, e.g. 'Dr. AKN, Prof. KS'
  is_department    boolean not null default false,
  unique (version_id, room_id, weekday, slot_id)
);

-- ---------------------------------------------------------------------------
-- Requests and allotment history
-- ---------------------------------------------------------------------------

create type public.request_type   as enum ('class', 'event');
create type public.request_status as enum ('pending', 'approved', 'rejected', 'withdrawn');

create table public.requests (
  id              uuid primary key default gen_random_uuid(),
  room_id         text not null references public.rooms(id),
  date            date not null,
  slot_id         smallint not null references public.slots(id),
  requester_email text not null references public.people(email),
  requester_name  text not null,
  type            public.request_type not null,
  description     text not null check (length(btrim(description)) >= 5),
  pdf_path        text,
  status          public.request_status not null default 'pending',
  priority        int not null default 0,      -- lower = earlier in the admin's queue
  decided_by      text,
  decided_at      timestamptz,
  decision_note   text,
  created_at      timestamptz not null default now(),
  check (type = 'class' or pdf_path is not null)
);
create index on public.requests (date, slot_id, room_id);
create index on public.requests (requester_email);
create unique index requests_one_pending_per_person
  on public.requests (room_id, date, slot_id, requester_email) where status = 'pending';

-- One row per change to a (room, date, slot). The latest row wins.
--   class_request / event_request : an approved faculty request
--   cie / event                   : an admin override
--   drop                          : the regular class was dropped, slot is free
--   restore                       : undo any change, back to the timetable
create type public.allotment_kind as enum
  ('class_request', 'event_request', 'cie', 'event', 'drop', 'restore');

create table public.allotments (
  id            bigserial primary key,
  room_id       text not null references public.rooms(id),
  date          date not null,
  slot_id       smallint not null references public.slots(id),
  kind          public.allotment_kind not null,
  title         text not null default '',   -- shown in the Subject column
  faculty_email text,
  faculty_name  text,                       -- snapshot, so history never changes
  reason        text not null default '',
  request_id    uuid references public.requests(id),
  created_by    text not null,
  created_at    timestamptz not null default now()
);
create index on public.allotments (date, room_id, slot_id, id desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.ist_now() returns timestamp
language sql stable as $$ select (now() at time zone 'Asia/Kolkata') $$;

create or replace function public.ist_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

create or replace function public.slot_end_at(p_date date, p_slot int) returns timestamptz
language sql stable as $$
  select ((p_date + s.ends) at time zone 'Asia/Kolkata') from public.slots s where s.id = p_slot
$$;

create or replace function public.slot_has_ended(p_date date, p_slot int) returns boolean
language sql stable as $$ select coalesce(public.slot_end_at(p_date, p_slot) <= now(), true) $$;

create or replace function public.current_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.current_person() returns public.people
language sql stable security definer set search_path = public as $$
  select * from public.people where email = public.current_email() and active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.people
                 where email = public.current_email() and active and role = 'admin')
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.people where email = public.current_email() and active)
$$;

create or replace function public.display_name(p public.people) returns text
language sql immutable as $$
  select case when p.title is not null and p.full_name not ilike p.title || '%'
              then p.title || ' ' || p.full_name else p.full_name end
$$;

-- ---------------------------------------------------------------------------
-- Immutability triggers (apply to every account, admins included)
-- ---------------------------------------------------------------------------

create or replace function public.forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception 'Records in % are permanent and cannot be changed or deleted', tg_table_name
    using errcode = 'P0001';
end $$;

create trigger allotments_no_update before update or delete on public.allotments
  for each row execute function public.forbid_change();
create trigger timetable_entries_no_update before update or delete on public.timetable_entries
  for each row execute function public.forbid_change();
create trigger timetable_versions_no_update before update or delete on public.timetable_versions
  for each row execute function public.forbid_change();
create trigger requests_no_delete before delete on public.requests
  for each row execute function public.forbid_change();

create or replace function public.allotments_guard_insert() returns trigger
language plpgsql as $$
begin
  if public.slot_has_ended(new.date, new.slot_id) then
    raise exception 'This slot has already ended; past allotments cannot be changed'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger allotments_guard_insert before insert on public.allotments
  for each row execute function public.allotments_guard_insert();

create or replace function public.requests_guard_update() returns trigger
language plpgsql as $$
begin
  if public.slot_has_ended(old.date, old.slot_id) then
    raise exception 'This slot has already ended; past requests cannot be changed'
      using errcode = 'P0001';
  end if;
  if (new.room_id, new.date, new.slot_id, new.requester_email, new.requester_name,
      new.type, new.description, new.pdf_path, new.created_at, new.id)
     is distinct from
     (old.room_id, old.date, old.slot_id, old.requester_email, old.requester_name,
      old.type, old.description, old.pdf_path, old.created_at, old.id) then
    raise exception 'Only the status and priority of a request can change'
      using errcode = 'P0001';
  end if;
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'This request has already been decided' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger requests_guard_update before update on public.requests
  for each row execute function public.requests_guard_update();

-- A new timetable version may not start in the past, so it can never rewrite history.
-- (The very first import is allowed to start at the beginning of the semester.)
create or replace function public.timetable_versions_guard_insert() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.timetable_versions) and new.valid_from < public.ist_today() then
    raise exception 'A timetable revision must start today or later' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger timetable_versions_guard_insert before insert on public.timetable_versions
  for each row execute function public.timetable_versions_guard_insert();

create or replace function public.timetable_entries_guard_insert() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.timetable_versions) > 1
     and (select valid_from from public.timetable_versions where id = new.version_id) < public.ist_today() then
    raise exception 'Cannot add entries to a timetable version that has already started'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger timetable_entries_guard_insert before insert on public.timetable_entries
  for each row execute function public.timetable_entries_guard_insert();

-- ---------------------------------------------------------------------------
-- The schedule for one day: every room x slot with what occupies it
-- ---------------------------------------------------------------------------

create or replace function public.faculty_display(p_initials text[], p_label text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when coalesce(array_length(p_initials, 1), 0) = 0 then nullif(p_label, '')
    else (
      select string_agg(coalesce(public.display_name(p), nullif(split_part(p_label, ', ', i.ord::int), ''), i.ini),
                        ', ' order by i.ord)
      from unnest(p_initials) with ordinality as i(ini, ord)
      left join public.people p on p.initials = i.ini
    )
  end
$$;

create or replace function public.get_day_schedule(p_date date)
returns table (
  room_id       text,
  room_name     text,
  slot_id       smallint,
  slot_label    text,
  starts        time,
  ends          time,
  status        text,      -- free | class | department | booked | cie | event
  subject       text,
  faculty_name  text,
  reason        text,
  is_mine       boolean,   -- the signed-in faculty teaches / booked it
  ended         boolean
)
language sql stable security definer set search_path = public as $$
  with
  me as (select initials, email from public.people where email = public.current_email() and active),
  ver as (
    select v.id from public.timetable_versions v
    where p_date between v.valid_from and v.valid_to
    order by v.valid_from desc, v.id desc limit 1
  ),
  latest as (
    select distinct on (a.room_id, a.slot_id) a.*
    from public.allotments a
    where a.date = p_date
    order by a.room_id, a.slot_id, a.id desc
  )
  select
    r.id, r.name, s.id, s.label, s.starts, s.ends,
    case
      when l.kind in ('class_request', 'event_request') then 'booked'
      when l.kind = 'cie'   then 'cie'
      when l.kind = 'event' then 'event'
      when l.kind = 'drop'  then 'free'
      when t.id is null     then 'free'
      when t.is_department  then 'department'
      else 'class'
    end,
    case
      when l.kind in ('class_request', 'event_request', 'cie', 'event') then l.title
      when l.kind = 'drop' then null
      else t.subject
    end,
    case
      when l.kind in ('class_request', 'event_request', 'cie', 'event') then l.faculty_name
      when l.kind = 'drop' then null
      when t.id is not null then public.faculty_display(t.faculty_initials, t.faculty_label)
    end,
    case
      when l.kind in ('class_request', 'event_request', 'cie', 'event') then l.reason
      when l.kind = 'drop' then 'Class dropped: ' || l.reason
    end,
    case
      when l.kind in ('class_request', 'event_request') then l.faculty_email = (select email from me)
      when l.kind is null or l.kind = 'restore' then
        coalesce((select initials from me) = any (t.faculty_initials), false)
      else false
    end,
    public.slot_has_ended(p_date, s.id)
  from public.rooms r
  cross join public.slots s
  left join public.timetable_entries t
    on t.version_id = (select id from ver)
   and t.room_id = r.id and t.slot_id = s.id
   and t.weekday = extract(isodow from p_date)
  left join latest l on l.room_id = r.id and l.slot_id = s.id
  where extract(isodow from p_date) between 1 and 6
  order by s.starts, r.sort_order, r.id
$$;

create or replace function public.slot_state(p_room text, p_date date, p_slot int)
returns table (status text, is_mine boolean)
language sql stable security definer set search_path = public as $$
  select d.status, d.is_mine from public.get_day_schedule(p_date) d
  where d.room_id = p_room and d.slot_id = p_slot
$$;

-- ---------------------------------------------------------------------------
-- Faculty actions
-- ---------------------------------------------------------------------------

create or replace function public.booking_window_check(p_date date, p_slot int)
returns void language plpgsql stable as $$
begin
  if extract(isodow from p_date) = 7 then
    raise exception 'Rooms cannot be booked on Sundays' using errcode = 'P0001';
  end if;
  if public.slot_has_ended(p_date, p_slot) then
    raise exception 'This slot has already ended' using errcode = 'P0001';
  end if;
  if p_date > public.ist_today() + 28 then
    raise exception 'Bookings open at most 4 weeks ahead' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.timetable_versions where p_date between valid_from and valid_to) then
    raise exception 'This date is outside the current semester' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.create_request(
  p_room text, p_date date, p_slot int,
  p_type public.request_type, p_description text, p_pdf_path text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me public.people;
  v_size bigint;
  v_id uuid;
begin
  me := public.current_person();
  if me.email is null then
    raise exception 'Only registered faculty can request rooms' using errcode = '42501';
  end if;
  perform public.booking_window_check(p_date, p_slot);
  if (select status from public.slot_state(p_room, p_date, p_slot)) is distinct from 'free' then
    raise exception 'Only free slots can be requested' using errcode = 'P0001';
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

  insert into public.requests (room_id, date, slot_id, requester_email, requester_name,
                               type, description, pdf_path, priority)
  values (p_room, p_date, p_slot, me.email, public.display_name(me), p_type, btrim(p_description), p_pdf_path,
          coalesce((select max(priority) + 1 from public.requests
                    where room_id = p_room and date = p_date and slot_id = p_slot), 0))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.withdraw_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.requests set status = 'withdrawn', decided_at = now(), decided_by = public.current_email()
   where id = p_id and requester_email = public.current_email() and status = 'pending';
  if not found then
    raise exception 'Request not found or already decided' using errcode = 'P0001';
  end if;
end $$;

-- Drop one occurrence of your own regular class (or your own approved booking).
create or replace function public.drop_class(p_room text, p_date date, p_slot int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me public.people;
  st record;
begin
  me := public.current_person();
  if me.email is null then
    raise exception 'Only registered faculty can drop classes' using errcode = '42501';
  end if;
  if public.slot_has_ended(p_date, p_slot) then
    raise exception 'This slot has already ended' using errcode = 'P0001';
  end if;
  select * into st from public.slot_state(p_room, p_date, p_slot);
  if st.status not in ('class', 'booked') or not st.is_mine then
    raise exception 'You can only drop a class that is assigned to you' using errcode = 'P0001';
  end if;
  insert into public.allotments (room_id, date, slot_id, kind, reason, faculty_email, faculty_name, created_by)
  values (p_room, p_date, p_slot, 'drop', coalesce(nullif(btrim(p_reason), ''), 'No reason given'),
          me.email, public.display_name(me), me.email);
end $$;

-- ---------------------------------------------------------------------------
-- Admin actions
-- ---------------------------------------------------------------------------

create or replace function public.require_admin() returns public.people
language plpgsql stable security definer set search_path = public as $$
declare me public.people;
begin
  me := public.current_person();
  if me.email is null or me.role <> 'admin' then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return me;
end $$;

create or replace function public.reject_others(p_room text, p_date date, p_slot int,
                                                p_except uuid, p_note text, p_by text)
returns void language sql security definer set search_path = public as $$
  update public.requests
     set status = 'rejected', decided_by = p_by, decided_at = now(), decision_note = p_note
   where room_id = p_room and date = p_date and slot_id = p_slot
     and status = 'pending' and id is distinct from p_except
$$;

create or replace function public.approve_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  r public.requests;
begin
  select * into r from public.requests where id = p_id for update;
  if r.id is null or r.status <> 'pending' then
    raise exception 'Request not found or already decided' using errcode = 'P0001';
  end if;
  if (select status from public.slot_state(r.room_id, r.date, r.slot_id)) is distinct from 'free' then
    raise exception 'The slot is no longer free' using errcode = 'P0001';
  end if;
  update public.requests set status = 'approved', decided_by = me.email, decided_at = now()
   where id = p_id;
  insert into public.allotments (room_id, date, slot_id, kind, title, faculty_email, faculty_name,
                                 reason, request_id, created_by)
  values (r.room_id, r.date, r.slot_id,
          case r.type when 'class' then 'class_request' else 'event_request' end::public.allotment_kind,
          case r.type when 'class' then 'Class' else 'Event' end,
          r.requester_email, r.requester_name, r.description, r.id, me.email);
  perform public.reject_others(r.room_id, r.date, r.slot_id, r.id,
                               'Another request was approved for this slot', me.email);
end $$;

create or replace function public.reject_request(p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare me public.people := public.require_admin();
begin
  update public.requests
     set status = 'rejected', decided_by = me.email, decided_at = now(), decision_note = nullif(btrim(p_note), '')
   where id = p_id and status = 'pending';
  if not found then
    raise exception 'Request not found or already decided' using errcode = 'P0001';
  end if;
end $$;

-- Move a pending request up (-1) or down (+1) among requests for the same slot.
create or replace function public.move_request(p_id uuid, p_dir int) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  r public.requests;
  other public.requests;
begin
  select * into r from public.requests where id = p_id and status = 'pending';
  if r.id is null then return; end if;
  select * into other from public.requests q
   where q.room_id = r.room_id and q.date = r.date and q.slot_id = r.slot_id and q.status = 'pending'
     and case when p_dir < 0 then (q.priority, q.created_at) < (r.priority, r.created_at)
              else (q.priority, q.created_at) > (r.priority, r.created_at) end
   order by case when p_dir < 0 then q.priority end desc, case when p_dir < 0 then q.created_at end desc,
            case when p_dir > 0 then q.priority end asc,  case when p_dir > 0 then q.created_at end asc
   limit 1;
  if other.id is null then return; end if;
  if other.priority = r.priority then
    -- same priority (ties broken by time): spread them apart first
    update public.requests set priority = other.priority + case when p_dir < 0 then -1 else 1 end
     where id = r.id;
  else
    update public.requests set priority = other.priority where id = r.id;
    update public.requests set priority = r.priority where id = other.id;
  end if;
end $$;

-- Take a slot for a CIE (exam) or a college event. Overrides any class or booking.
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

-- Undo a change for a future slot (back to the timetable). Recorded as history, not deleted.
create or replace function public.admin_restore(p_room text, p_date date, p_slot int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.people := public.require_admin();
begin
  if not exists (select 1 from public.allotments where room_id = p_room and date = p_date and slot_id = p_slot) then
    raise exception 'Nothing to restore for this slot' using errcode = 'P0001';
  end if;
  insert into public.allotments (room_id, date, slot_id, kind, reason, faculty_email, faculty_name, created_by)
  values (p_room, p_date, p_slot, 'restore', coalesce(nullif(btrim(p_reason), ''), 'Restored to timetable'),
          me.email, public.display_name(me), me.email);
end $$;

create or replace function public.admin_upsert_person(
  p_email text, p_full_name text, p_initials text, p_title text, p_role public.app_role, p_active boolean
) returns void language plpgsql security definer set search_path = public as $$
declare me public.people := public.require_admin();
begin
  if lower(btrim(p_email)) = me.email and (p_role <> 'admin' or not p_active) then
    raise exception 'You cannot remove your own admin access' using errcode = 'P0001';
  end if;
  insert into public.people (email, full_name, initials, title, role, active)
  values (lower(btrim(p_email)), btrim(p_full_name), nullif(upper(btrim(p_initials)), ''),
          nullif(btrim(p_title), ''), p_role, p_active)
  on conflict (email) do update
    set full_name = excluded.full_name, initials = excluded.initials, title = excluded.title,
        role = excluded.role, active = excluded.active;
end $$;

-- ---------------------------------------------------------------------------
-- Row-level security. Writes happen only through the functions above.
-- ---------------------------------------------------------------------------

alter table public.rooms             enable row level security;
alter table public.slots             enable row level security;
alter table public.people            enable row level security;
alter table public.timetable_versions enable row level security;
alter table public.timetable_entries enable row level security;
alter table public.requests          enable row level security;
alter table public.allotments        enable row level security;

create policy "anyone reads rooms" on public.rooms for select using (true);
create policy "anyone reads slots" on public.slots for select using (true);
create policy "anyone reads versions" on public.timetable_versions for select using (true);
create policy "anyone reads timetable" on public.timetable_entries for select using (true);

create policy "staff read self, admins read all" on public.people for select
  using (email = public.current_email() or public.is_admin());

create policy "own requests or admin" on public.requests for select
  using (requester_email = public.current_email() or public.is_admin());

create policy "staff read history" on public.allotments for select using (public.is_staff());

revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to anon, authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.get_day_schedule(date) to anon, authenticated;
grant execute on function
  public.create_request(text, date, int, public.request_type, text, text),
  public.withdraw_request(uuid),
  public.drop_class(text, date, int, text),
  public.approve_request(uuid),
  public.reject_request(uuid, text),
  public.move_request(uuid, int),
  public.admin_override(text, date, int, public.allotment_kind, text, text),
  public.admin_restore(text, date, int, text),
  public.admin_upsert_person(text, text, text, text, public.app_role, boolean),
  public.is_admin(), public.is_staff(), public.current_person(), public.current_email()
to authenticated;
-- helpers used inside policies and other functions
grant execute on function public.current_email(), public.is_admin(), public.is_staff(),
  public.ist_today(), public.ist_now(), public.slot_end_at(date, int), public.slot_has_ended(date, int)
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for approval letters (PDF, at most 5 MB)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('letters', 'letters', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy "staff upload own letters" on storage.objects for insert to authenticated
  with check (bucket_id = 'letters' and public.is_staff()
              and (storage.foldername(name))[1] = public.current_email());

create policy "own letters or admin" on storage.objects for select to authenticated
  using (bucket_id = 'letters'
         and ((storage.foldername(name))[1] = public.current_email() or public.is_admin()));

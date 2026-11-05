-- 1. Faculty leave: an admin marks a faculty member on leave for one or more days. They show as
--    busy ("On leave") everywhere free and busy faculty are listed, so they are never suggested
--    as a substitute, and the Leave page lists their classes with who could take them.
-- 2. Activity log: every change admins and faculty make (requests, bookings, timetable edits
--    and uploads, faculty, rooms, holidays, notices, leave) is recorded with who and when.
--    Changes made in one go, e.g. a CIE week, share a transaction id so they show as one line.
-- Depends on 0020 (faculty_status, day orders, notices, room details) and 0022.

-- ---------------------------------------------------------------------------
-- 1. Faculty leave
-- ---------------------------------------------------------------------------

create table if not exists public.faculty_leave (
  id         bigserial primary key,
  initials   text not null check (length(btrim(initials)) > 0),
  starts_on  date not null,
  ends_on    date not null,
  reason     text not null default '' check (length(reason) <= 120),
  created_by text not null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 90)
);
create index if not exists faculty_leave_dates on public.faculty_leave (starts_on, ends_on);
alter table public.faculty_leave enable row level security;
drop policy if exists "admins read leave" on public.faculty_leave;
create policy "admins read leave" on public.faculty_leave for select using (public.is_admin());
grant select on public.faculty_leave to authenticated;

create or replace function public.admin_add_leave(p_initials text, p_from date, p_to date, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_ini text := upper(btrim(coalesce(p_initials, '')));
  v_to date := coalesce(p_to, p_from);
begin
  if v_ini = '' then
    raise exception 'Pick a faculty member' using errcode = 'P0001';
  end if;
  if p_from is null or v_to < p_from then
    raise exception 'The leave must end on or after the day it starts' using errcode = 'P0001';
  end if;
  if v_to - p_from > 90 then
    raise exception 'Leave can be at most 90 days at a time' using errcode = 'P0001';
  end if;
  if v_to < public.ist_today() then
    raise exception 'That leave is already over' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.faculty_leave where initials = v_ini and starts_on <= v_to and ends_on >= p_from) then
    raise exception '% is already on leave on some of those days', v_ini using errcode = 'P0001';
  end if;
  insert into public.faculty_leave (initials, starts_on, ends_on, reason, created_by)
  values (v_ini, p_from, v_to, btrim(coalesce(p_reason, '')), me.email);
end $$;
revoke execute on function public.admin_add_leave(text, date, date, text) from public, anon;
grant execute on function public.admin_add_leave(text, date, date, text) to authenticated;

create or replace function public.admin_remove_leave(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare me public.people := public.require_admin();
begin
  delete from public.faculty_leave where id = p_id;
  if not found then
    raise exception 'That leave was already removed' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function public.admin_remove_leave(bigint) from public, anon;
grant execute on function public.admin_remove_leave(bigint) to authenticated;

-- Free and busy faculty, now with leave (otherwise as in 0020)
create or replace function public.faculty_status(p_date date)
returns table (
  initials text,
  name     text,
  cluster  text,      -- 'A', 'B' or null
  slot_id  smallint,
  busy     boolean,
  activity text,      -- what they are doing, when busy
  room_id  text
)
language sql stable security definer set search_path = public as $$
  with
  ver as (
    select v.id from public.timetable_versions v
    where p_date between v.valid_from and v.valid_to
    order by v.valid_from desc, v.id desc limit 1
  ),
  open_day as (
    select extract(isodow from p_date) between 1 and 6
           and not exists (select 1 from public.holidays h where h.date = p_date) as ok
  ),
  latest as (
    select distinct on (a.room_id, a.slot_id) a.*
    from public.allotments a
    where a.date = p_date
    order by a.room_id, a.slot_id, a.id desc
  ),
  -- Classes that still take place that day
  classes as (
    select ini, t.slot_id::smallint as slot_id, t.subject as activity, t.room_id
    from public.timetable_entries t
    cross join lateral unnest(t.faculty_initials) as ini
    left join latest l on l.room_id = t.room_id and l.slot_id = t.slot_id
    where t.version_id = (select id from ver)
      and t.weekday = public.day_order(p_date)
      and not t.is_department
      and (l.kind is null or l.kind = 'restore')
  ),
  booked as (
    select p.initials as ini, l.slot_id, l.title as activity, l.room_id
    from latest l join public.people p on p.email = l.faculty_email
    where l.kind in ('class_request', 'event_request') and p.initials is not null
  ),
  duties as (
    select d.initials as ini, d.slot_id, 'Other duty'::text as activity, null::text as room_id
    from public.faculty_duties d
    where d.weekday = public.day_order(p_date)
  ),
  -- A faculty member on leave is busy all day, whatever else they had
  on_leave as (
    select lv.initials as ini, s.id as slot_id, 'On leave'::text as activity, null::text as room_id
    from public.faculty_leave lv cross join public.slots s
    where p_date between lv.starts_on and lv.ends_on
  ),
  busy as (
    select * from classes union all select * from booked union all select * from duties union all select * from on_leave
  ),
  faculty as (
    select initials from public.faculty_directory
    union select initials from public.people where initials is not null and active
    union select unnest(t.faculty_initials) from public.timetable_entries t
           where t.version_id = (select id from ver) and not t.is_department
  )
  select f.initials,
         coalesce(public.display_name(p),
                  case when btrim(d.full_name) <> '' then btrim(d.title || ' ' || d.full_name) end,
                  f.initials),
         c.cluster,
         s.id,
         b.activity is not null,
         b.activity,
         b.room_id
  from faculty f
  cross join public.slots s
  left join public.people p on p.initials = f.initials and p.active
  left join public.faculty_directory d on d.initials = f.initials
  left join public.faculty_clusters c on c.initials = f.initials
  left join lateral (
    select string_agg(distinct x.activity, ' / ') as activity, string_agg(distinct x.room_id, ', ') as room_id
    from busy x where x.ini = f.initials and x.slot_id = s.id
  ) b on true
  where (select ok from open_day)
    and not public.slot_closed(p_date, s.id)
  order by s.starts, f.initials
$$;

-- ---------------------------------------------------------------------------
-- 2. Activity log
-- ---------------------------------------------------------------------------

create table if not exists public.activity_log (
  id    bigserial primary key,
  at    timestamptz not null default now(),
  actor text,                -- the signed-in email; null when run from the SQL Editor
  txid  bigint not null,     -- one action can change many rows
  tbl   text not null,
  op    text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  old   jsonb,
  new   jsonb
);
create index if not exists activity_log_at on public.activity_log (id desc);
create index if not exists activity_log_actor on public.activity_log (actor, id desc);
alter table public.activity_log enable row level security;
drop policy if exists "admins read activity" on public.activity_log;
create policy "admins read activity" on public.activity_log for select using (public.is_admin());
grant select on public.activity_log to authenticated;

create or replace function public.log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- A request moved in the queue or decided: skip updates that change nothing
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then
    return null;
  end if;
  -- Timetable edits are logged through timetable_changes; only uploads are logged here
  if tg_table_name = 'timetable_versions' and (tg_op <> 'INSERT' or to_jsonb(new) ->> 'name' not like 'Uploaded%') then
    return null;
  end if;
  insert into public.activity_log (actor, txid, tbl, op, old, new)
  values (nullif(public.current_email(), ''), txid_current(), tg_table_name, tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['requests', 'allotments', 'timetable_changes', 'timetable_versions', 'people',
                           'faculty_directory', 'faculty_clusters', 'faculty_duties', 'faculty_subjects',
                           'rooms', 'holidays', 'day_orders', 'notices', 'faculty_leave'] loop
    execute format('drop trigger if exists log_activity on public.%I', t);
    execute format('create trigger log_activity after insert or update or delete on public.%I
                    for each row execute function public.log_activity()', t);
  end loop;
end $$;

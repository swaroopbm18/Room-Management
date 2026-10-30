-- Approved client features that need the database:
-- 1. Day-order swaps: a working day can follow another weekday's timetable (e.g. a Saturday that
--    runs Monday's classes). Everything that reads the timetable for a date now uses day_order().
--    A Saturday that follows a weekday runs the full day; otherwise Saturday still ends at 2 PM.
-- 2. Notices: a short message admins show on the home page between two dates.
-- 3. Room details: capacity, kind of room and a projector, to filter free rooms.
-- Depends on 0019.

-- ---------------------------------------------------------------------------
-- 1. Day-order swaps
-- ---------------------------------------------------------------------------

create table public.day_orders (
  date       date primary key,
  follows    smallint not null check (follows between 1 and 6),  -- ISO weekday whose timetable runs
  note       text not null default '',
  created_by text not null,
  created_at timestamptz not null default now()
);
alter table public.day_orders enable row level security;
create policy "anyone reads day orders" on public.day_orders for select using (true);
grant select on public.day_orders to anon, authenticated;

-- The weekday whose timetable runs on a date (1 = Monday): its own, unless swapped.
create or replace function public.day_order(p_date date) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select o.follows from public.day_orders o where o.date = p_date), extract(isodow from p_date)::int)
$$;
grant execute on function public.day_order(date) to anon, authenticated;

create or replace function public.admin_set_day_order(p_date date, p_follows int, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare me public.people := public.require_admin();
begin
  if p_date <= public.ist_today() then
    raise exception 'A day swap can be set for tomorrow or later' using errcode = 'P0001';
  end if;
  if extract(isodow from p_date) = 7 then
    raise exception 'Sundays have no timetable' using errcode = 'P0001';
  end if;
  if p_follows is null or p_follows = extract(isodow from p_date) then
    delete from public.day_orders where date = p_date;
    return;
  end if;
  if p_follows not between 1 and 6 then
    raise exception 'Pick a weekday from Monday to Saturday' using errcode = 'P0001';
  end if;
  insert into public.day_orders (date, follows, note, created_by) values (p_date, p_follows, btrim(coalesce(p_note, '')), me.email)
  on conflict (date) do update set follows = excluded.follows, note = excluded.note, created_by = excluded.created_by, created_at = now();
end $$;
revoke execute on function public.admin_set_day_order(date, int, text) from public, anon;
grant execute on function public.admin_set_day_order(date, int, text) to authenticated;

-- Saturday ends at 2 PM unless it runs a weekday's timetable
create or replace function public.slot_closed(p_date date, p_slot int) returns boolean
language sql stable set search_path = public as $$
  select extract(isodow from p_date) = 6
     and public.day_order(p_date) = 6
     and coalesce((select s.starts >= time '14:00' from public.slots s where s.id = p_slot), false)
$$;
grant execute on function public.slot_closed(date, int) to anon, authenticated;

-- Every reader of the timetable for a date now follows the day order

create or replace function public.get_day_schedule(p_date date)
returns table (
  room_id       text,
  room_name     text,
  slot_id       smallint,
  slot_label    text,
  starts        time,
  ends          time,
  status        text,      -- free | class | department | booked | cie | event | closed
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
      -- Saturday afternoon: closed unless an admin took the room for a CIE or event, or the timetable has a class
      when public.slot_closed(p_date, s.id) and (l.kind is null and t.id is null or l.kind in ('drop', 'restore') and t.id is null or l.kind = 'drop') then 'closed'
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
   and t.weekday = public.day_order(p_date)
   and not exists (select 1 from public.holidays h where h.date = p_date)
  left join latest l on l.room_id = r.id and l.slot_id = s.id
  where extract(isodow from p_date) between 1 and 6
  order by s.starts, r.sort_order, r.id
$$;

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
  busy as (
    select * from classes union all select * from booked union all select * from duties
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

create or replace function public.get_timetable(p_date date)
returns table (room_id text, slot_id int, subject text, faculty_initials text[], faculty_name text, is_department boolean)
language sql stable security definer set search_path = public as $$
  select t.room_id, t.slot_id, t.subject, t.faculty_initials,
         public.faculty_display(t.faculty_initials, t.faculty_label), t.is_department
  from public.timetable_entries t
  where t.version_id = (select v.id from public.timetable_versions v
                         where p_date between v.valid_from and v.valid_to
                         order by v.valid_from desc, v.id desc limit 1)
    and t.weekday = public.day_order(p_date)
$$;

create or replace function public.get_change_report(p_from date, p_to date)
returns table (
  date date, slot_id int, starts time, ends time, room_id text,
  kind public.allotment_kind, title text, faculty_name text, reason text, subject text
)
language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (a.date, a.room_id, a.slot_id) a.*
    from public.allotments a
    where a.date between p_from and p_to
    order by a.date, a.room_id, a.slot_id, a.id desc
  )
  select l.date, l.slot_id, s.starts, s.ends, l.room_id, l.kind, l.title, l.faculty_name, l.reason,
         (select t.subject from public.timetable_entries t
           where t.version_id = (select v.id from public.timetable_versions v
                                  where l.date between v.valid_from and v.valid_to
                                  order by v.valid_from desc, v.id desc limit 1)
             and t.room_id = l.room_id and t.slot_id = l.slot_id
             and t.weekday = public.day_order(l.date))
  from latest l
  join public.slots s on s.id = l.slot_id
  where l.kind <> 'restore' and public.is_admin()
  order by l.date, s.starts, l.room_id
$$;


-- ---------------------------------------------------------------------------
-- 2. Notices on the home page
-- ---------------------------------------------------------------------------

create table public.notices (
  id         bigserial primary key,
  message    text not null check (length(btrim(message)) between 1 and 300),
  starts_on  date not null,
  ends_on    date not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
alter table public.notices enable row level security;
create policy "anyone reads notices" on public.notices for select using (true);
grant select on public.notices to anon, authenticated;

create or replace function public.admin_add_notice(p_message text, p_starts date, p_ends date) returns void
language plpgsql security definer set search_path = public as $$
declare me public.people := public.require_admin();
begin
  if p_ends < p_starts then
    raise exception 'The notice must end on or after the day it starts' using errcode = 'P0001';
  end if;
  insert into public.notices (message, starts_on, ends_on, created_by) values (btrim(p_message), p_starts, p_ends, me.email);
end $$;

create or replace function public.admin_remove_notice(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  delete from public.notices where id = p_id;
end $$;
revoke execute on function public.admin_add_notice(text, date, date) from public, anon;
grant execute on function public.admin_add_notice(text, date, date) to authenticated;
revoke execute on function public.admin_remove_notice(bigint) from public, anon;
grant execute on function public.admin_remove_notice(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Room details
-- ---------------------------------------------------------------------------

alter table public.rooms
  add column if not exists capacity int check (capacity is null or capacity between 1 and 1000),
  add column if not exists kind text not null default 'classroom' check (kind in ('classroom', 'lab', 'seminar')),
  add column if not exists projector boolean not null default false,
  add column if not exists notes text not null default '';

create or replace function public.admin_update_room(p_room text, p_capacity int, p_kind text, p_projector boolean, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.rooms
     set capacity = p_capacity, kind = p_kind, projector = coalesce(p_projector, false), notes = btrim(coalesce(p_notes, ''))
   where id = p_room;
  if not found then
    raise exception 'No such room' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function public.admin_update_room(text, int, text, boolean, text) from public, anon;
grant execute on function public.admin_update_room(text, int, text, boolean, text) to authenticated;

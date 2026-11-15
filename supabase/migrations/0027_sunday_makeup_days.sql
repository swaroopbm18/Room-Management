-- Make-up days on a Sunday: when a holiday falls on a working day, an admin can run that day's
-- timetable on a Sunday instead (e.g. Monday is a holiday, so Sunday follows Monday's timetable).
-- A Sunday becomes a working day only when it has a day swap (day_orders). Everything that reads
-- the timetable for a date already goes through day_order(), so classes, free rooms, free
-- faculty, bookings, My week, the report and history all follow the Sunday the same way.
-- A Sunday that follows Saturday ends at 2 PM like a Saturday; otherwise it runs the full day.
-- Depends on 0026.

-- A day with a timetable: Monday to Saturday, or a Sunday that runs a weekday's timetable.
create or replace function public.is_working_day(p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select extract(isodow from p_date) between 1 and 6
      or exists (select 1 from public.day_orders o where o.date = p_date)
$$;
grant execute on function public.is_working_day(date) to anon, authenticated;

-- Day swaps can now be set on a Sunday too (a make-up day)
create or replace function public.admin_set_day_order(p_date date, p_follows int, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare me public.people := public.require_admin();
begin
  if p_date <= public.ist_today() then
    raise exception 'A day swap can be set for tomorrow or later' using errcode = 'P0001';
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

-- A Sunday that follows Saturday's timetable ends at 2 PM, like a Saturday
create or replace function public.slot_closed(p_date date, p_slot int) returns boolean
language sql stable set search_path = public as $$
  select extract(isodow from p_date) in (6, 7)
     and public.day_order(p_date) = 6
     and coalesce((select s.starts >= time '14:00' from public.slots s where s.id = p_slot), false)
$$;

-- Bookings and requests: a make-up Sunday can be booked like any working day
create or replace function public.booking_window_check(p_date date, p_slot int) returns void
language plpgsql stable as $$
begin
  if not public.is_working_day(p_date) then
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

-- The day's schedule, free and busy faculty, and past records: open on a make-up Sunday.
-- faculty_status also groups who is busy once instead of per faculty member and slot (about 10x faster).
CREATE OR REPLACE FUNCTION public.get_day_schedule(p_date date)
 RETURNS TABLE(room_id text, room_name text, slot_id smallint, slot_label text, starts time without time zone, ends time without time zone, status text, subject text, faculty_name text, reason text, is_mine boolean, ended boolean, original_subject text, original_faculty text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      when l.kind = 'class_request' and l.request_id is null then coalesce(l.faculty_name, 'No faculty assigned')
      when l.kind in ('class_request', 'event_request', 'cie', 'event') then l.faculty_name
      when l.kind = 'drop' then null
      when t.id is not null then public.faculty_display(t.faculty_initials, t.faculty_label)
    end,
    case
      when l.kind in ('class_request', 'event_request', 'cie', 'event') then l.reason
      when l.kind = 'drop' then 'Class dropped: ' || l.reason
    end,
    case
      when l.kind in ('class_request', 'event_request') then
        coalesce(l.faculty_email = (select email from me), false)
        or coalesce(l.faculty_initials = (select initials from me), false)
      when l.kind is null or l.kind = 'restore' then
        coalesce((select initials from me) = any (t.faculty_initials), false)
      else false
    end,
    public.slot_has_ended(p_date, s.id),
    case when l.kind in ('class_request', 'event_request', 'cie', 'event') and t.id is not null then
      case when t.is_department then t.subject || ' department' else t.subject end
    end,
    case when l.kind in ('class_request', 'event_request', 'cie', 'event') and t.id is not null and not t.is_department then
      public.faculty_display(t.faculty_initials, t.faculty_label)
    end
  from public.rooms r
  cross join public.slots s
  left join public.timetable_entries t
    on t.version_id = (select id from ver)
   and t.room_id = r.id and t.slot_id = s.id
   and t.weekday = public.day_order(p_date)
   and not exists (select 1 from public.holidays h where h.date = p_date)
  left join latest l on l.room_id = r.id and l.slot_id = s.id
  where public.is_working_day(p_date)
    and not r.archived
  order by s.starts, r.sort_order, r.id
$function$;

CREATE OR REPLACE FUNCTION public.faculty_status(p_date date)
 RETURNS TABLE(initials text, name text, cluster text, slot_id smallint, busy boolean, activity text, room_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with
  ver as (
    select v.id from public.timetable_versions v
    where p_date between v.valid_from and v.valid_to
    order by v.valid_from desc, v.id desc limit 1
  ),
  open_day as (
    select public.is_working_day(p_date)
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
    select coalesce(l.faculty_initials, p.initials) as ini, l.slot_id, l.title as activity, l.room_id
    from latest l left join public.people p on p.email = l.faculty_email
    where l.kind in ('class_request', 'event_request') and coalesce(l.faculty_initials, p.initials) is not null
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
  -- Grouped once, then joined, instead of searching the whole list for every faculty member and slot
  busy_by_slot as (
    select ini, slot_id::int as slot_id, string_agg(distinct activity, ' / ') as activity, string_agg(distinct room_id, ', ') as room_id
    from busy group by ini, slot_id
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
  left join busy_by_slot b on b.ini = f.initials and b.slot_id = s.id
  where (select ok from open_day)
    and not public.slot_closed(p_date, s.id)
  order by s.starts, f.initials
$function$;

CREATE OR REPLACE FUNCTION public.admin_override(p_room text, p_date date, p_slot integer, p_kind allotment_kind, p_title text, p_reason text, p_faculty text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me public.people := public.require_admin();
  v_past boolean := public.slot_has_ended(p_date, p_slot);
  v_ini text := nullif(upper(btrim(coalesce(p_faculty, ''))), '');
  v_email text;
  v_name text;
begin
  if p_kind not in ('cie', 'event', 'class_request') then
    raise exception 'A room can be allotted for a class, a CIE or an event' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Please add a description' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.rooms where id = p_room) then
    raise exception 'Room not found' using errcode = 'P0001';
  end if;

  if v_past then
    -- A record of something that already happened: same rules as booking, except the date
    if not public.is_working_day(p_date) then
      raise exception 'That Sunday was not a working day' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.timetable_versions where p_date between valid_from and valid_to) then
      raise exception 'This date is outside the current semester' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.holidays where date = p_date) then
      raise exception 'That day was a holiday' using errcode = 'P0001';
    end if;
    perform set_config('app.past_record', 'on', true);
  else
    perform public.booking_window_check(p_date, p_slot);
  end if;

  if p_kind = 'class_request' then
    if v_ini is not null then
      if not exists (select 1 from public.people where initials = v_ini and active)
         and not exists (select 1 from public.faculty_directory where initials = v_ini)
         and not exists (select 1 from public.timetable_entries where v_ini = any (faculty_initials)) then
        raise exception 'No faculty member has the initials %', v_ini using errcode = 'P0001';
      end if;
      select email into v_email from public.people where initials = v_ini and active limit 1;
      v_name := public.faculty_display(array[v_ini], null);
    end if;
  else
    v_ini := null;
    v_email := me.email;
    v_name := public.display_name(me);
  end if;

  insert into public.allotments (room_id, date, slot_id, kind, title, faculty_email, faculty_name, faculty_initials, reason, created_by)
  values (p_room, p_date, p_slot, p_kind,
          coalesce(nullif(btrim(p_title), ''), case p_kind when 'cie' then 'CIE' when 'event' then 'Event' else 'Class' end),
          v_email, v_name, v_ini, btrim(p_reason), me.email);

  -- Requests for a slot that has ended can't change, and there is nothing to decline
  if not v_past then
    perform public.reject_others(p_room, p_date, p_slot, null,
      case p_kind when 'class_request' then 'Slot taken for a class' else 'Slot taken for a ' || upper(p_kind::text) end,
      me.email);
  end if;
end $function$;

-- ---------------------------------------------------------------------------
-- Speed: indexes for the busiest reads
-- ---------------------------------------------------------------------------

-- A day's timetable (schedule, free faculty, availability) reads one version's classes for one weekday
create index if not exists timetable_entries_day on public.timetable_entries (version_id, weekday, slot_id);
-- Pending requests: the admin home page, the approvals list and the counts on the slot pages
create index if not exists requests_pending on public.requests (date, slot_id) where status = 'pending';
-- Leave and duties are read for one day or weekday at a time
create index if not exists faculty_duties_weekday on public.faculty_duties (weekday, slot_id);

-- Postgres was compiling the bigger reads to machine code (JIT) on every call because its row
-- estimates are large, which cost about 0.8 s each time: faculty_status went from ~850 ms to ~15 ms
-- and a day's schedule from ~50 ms to ~10 ms with it off. These reads are small, so JIT never pays
-- off: turn it off for every function in this app that returns rows.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proretset and p.prokind = 'f'
  loop
    execute format('alter function %s set jit = off', f);
  end loop;
end $$;

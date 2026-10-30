-- Saturday classes end at 2 PM. Saturday slots from 2:00 on are "closed": never shown as free,
-- never bookable by faculty, and left out of the free and busy faculty counts. Admins can still
-- take a room then for a CIE or event. Depends on 0007 and 0016.

create or replace function public.slot_closed(p_date date, p_slot int) returns boolean
language sql stable set search_path = public as $$
  select extract(isodow from p_date) = 6
     and coalesce((select s.starts >= time '14:00' from public.slots s where s.id = p_slot), false)
$$;
grant execute on function public.slot_closed(date, int) to anon, authenticated;

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
   and t.weekday = extract(isodow from p_date)
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
      and t.weekday = extract(isodow from p_date)
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
    where d.weekday = extract(isodow from p_date)
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

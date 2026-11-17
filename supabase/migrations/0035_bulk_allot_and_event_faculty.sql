-- 0035:
-- 1. Several faculty for one event, CIE or SEE: by name, a whole cluster (A or B) or the whole
--    department. They show on the timetable and in the report, and as busy on Faculty status.
--    allotments.faculty_initials holds them comma-separated ("MP,STN"); p_faculty takes
--    initials, comma-separated initials, "@A", "@B" or "@ALL".
-- 2. Bulk allot: one event, CIE or SEE in several rooms, at several times, every working day
--    from a start date to an end date, all or none, optionally cancelling the classes of the
--    semesters writing the exam.
-- 3. Classes cancelled for an SEE read "Cancelled for SEE: …".
-- Depends on 0034. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Several faculty
-- ---------------------------------------------------------------------------

-- p_faculty → the initials ("MP,STN") and the name to show ("Dr. Monika P, Prof. Suma TN",
-- "Cluster A faculty" or "All department faculty")
create or replace function public.resolve_faculty(p_faculty text, out initials text, out name text)
language plpgsql stable security definer set search_path = public as $$
declare
  v text := upper(regexp_replace(coalesce(p_faculty, ''), '\s', '', 'g'));
  v_list text[];
  v_bad text;
begin
  if v = '' then
    return;
  end if;
  if v in ('@A', '@B') then
    select array_agg(c.initials order by c.initials) into v_list from public.faculty_clusters c where c.cluster = substr(v, 2);
    if v_list is null then
      raise exception 'No faculty are in cluster %', substr(v, 2) using errcode = 'P0001';
    end if;
    initials := array_to_string(v_list, ',');
    name := 'Cluster ' || substr(v, 2) || ' faculty';
    return;
  end if;
  if v = '@ALL' then
    select array_agg(x order by x) into v_list from (
      select d.initials as x from public.faculty_directory d
      union select p.initials from public.people p where p.initials is not null and p.active and p.role <> 'admin'
    ) t;
    initials := array_to_string(v_list, ',');
    name := 'All department faculty';
    return;
  end if;
  select array_agg(distinct x) into v_list from unnest(string_to_array(v, ',')) x where x <> '';
  select x into v_bad from unnest(v_list) x
   where not exists (select 1 from public.people where people.initials = x and active)
     and not exists (select 1 from public.faculty_directory d where d.initials = x)
     and not exists (select 1 from public.timetable_entries t where x = any (t.faculty_initials))
   limit 1;
  if v_bad is not null then
    raise exception 'No faculty member has the initials %', v_bad using errcode = 'P0001';
  end if;
  -- In the order given
  select array_agg(x order by o) into v_list from (
    select x, min(o) as o from unnest(string_to_array(v, ',')) with ordinality as u(x, o) where x <> '' group by x
  ) t;
  initials := array_to_string(v_list, ',');
  name := public.faculty_display(v_list, null);
end $$;
revoke execute on function public.resolve_faculty(text) from public, anon;
grant execute on function public.resolve_faculty(text) to authenticated;

create or replace function public.admin_override(p_room text, p_date date, p_slot integer, p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me public.people := public.require_admin();
  v_past boolean := public.slot_has_ended(p_date, p_slot);
  v_ini text := nullif(upper(btrim(coalesce(p_faculty, ''))), '');
  f record;
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

  if p_kind = 'class_request' and v_ini is not null then
    -- A class has one faculty member
    if v_ini ~ '[,@]' then
      raise exception 'A class can have one faculty member' using errcode = 'P0001';
    end if;
    select * into f from public.resolve_faculty(v_ini);
    v_ini := f.initials;
    v_name := f.name;
    select email into v_email from public.people where initials = v_ini and active limit 1;
  elsif p_kind = 'class_request' then
    v_ini := null;
  elsif v_ini is not null then
    -- An event's, CIE's or SEE's faculty in charge (optional): one or more, a cluster or the whole department
    select * into f from public.resolve_faculty(v_ini);
    v_ini := f.initials;
    v_name := f.name;
    v_email := me.email;  -- stays the allotting admin's, with its faculty named
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
end $$;

create or replace function public.admin_edit_record(
  p_room text, p_date date, p_slots int[], p_title text, p_reason text, p_faculty text default null
) returns int language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_title text := btrim(coalesce(p_title, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_ini text := nullif(upper(btrim(coalesce(p_faculty, ''))), '');
  v_name text;
  v_slot int;
  cur public.allotments;
  v_n int := 0;
begin
  if coalesce(array_length(p_slots, 1), 0) = 0 then
    raise exception 'Pick at least one slot' using errcode = 'P0001';
  end if;
  if length(v_title) > 80 then
    raise exception 'The name can be at most 80 characters' using errcode = 'P0001';
  end if;
  if length(v_reason) < 3 or length(v_reason) > 500 then
    raise exception 'The description must be 3 to 500 characters' using errcode = 'P0001';
  end if;
  if v_ini is not null and v_ini <> '-' then
    select r.initials, r.name into v_ini, v_name from public.resolve_faculty(v_ini) r;
  end if;
  perform set_config('app.record_edit', 'on', true);

  foreach v_slot in array p_slots loop
    select * into cur from public.allotments
     where room_id = p_room and date = p_date and slot_id = v_slot order by id desc limit 1;
    if cur.id is null or cur.kind not in ('class_request', 'event_request', 'cie', 'event') then
      raise exception 'Only a booked class, event or CIE can be edited' using errcode = 'P0001';
    end if;
    insert into public.allotments (room_id, date, slot_id, kind, title, faculty_email, faculty_name, faculty_initials,
                                   reason, request_id, created_by)
    values (cur.room_id, cur.date, cur.slot_id, cur.kind,
            coalesce(nullif(v_title, ''), cur.title),
            cur.faculty_email,
            case when v_ini is null then cur.faculty_name when v_ini = '-' then null else v_name end,
            case when v_ini is null then cur.faculty_initials when v_ini = '-' then null else v_ini end,
            v_reason, cur.request_id, me.email);
    v_n := v_n + 1;
  end loop;
  perform set_config('app.record_edit', '', true);
  return v_n;
end $$;

-- Faculty status: every faculty member named for an event, CIE or SEE is busy then
create or replace function public.faculty_status(p_date date) RETURNS TABLE(initials text, name text, cluster text, slot_id smallint, busy boolean, activity text, room_id text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET jit TO 'off'
    AS $$
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
    -- A booking's faculty, and every faculty member named for an event, CIE or SEE
    select ini, l.slot_id, l.title as activity, l.room_id
    from latest l left join public.people p on p.email = l.faculty_email
    cross join lateral unnest(string_to_array(
      case when l.kind in ('class_request', 'event_request') then coalesce(l.faculty_initials, p.initials) else l.faculty_initials end, ',')) as ini
    where l.kind in ('class_request', 'event_request', 'event', 'cie')
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
$$;

-- ---------------------------------------------------------------------------
-- 2. Bulk allot
-- ---------------------------------------------------------------------------

-- p_places as for admin_override_many; p_semesters: the semesters whose classes are cancelled
-- on each of those days (a CIE or SEE), or null.
create or replace function public.admin_bulk_allot(
  p_places jsonb, p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text default null, p_semesters text[] default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_slots int;
  v_cancelled int := 0;
  d date;
begin
  perform public.require_admin();
  v_slots := public.admin_override_many(p_places, p_kind, p_title, p_reason, p_faculty);
  if coalesce(array_length(p_semesters, 1), 0) > 0 then
    for d in select distinct (p ->> 'date')::date from jsonb_array_elements(p_places) p order by 1 loop
      v_cancelled := v_cancelled + public.admin_cancel_semester_classes(d, p_semesters,
        coalesce(nullif(btrim(p_title), ''), upper(p_kind::text)) || ', semester ' || array_to_string(p_semesters, ', '));
    end loop;
  end if;
  return jsonb_build_object('slots', v_slots, 'cancelled', v_cancelled);
end $$;
revoke execute on function public.admin_bulk_allot(jsonb, public.allotment_kind, text, text, text, text[]) from public, anon;
grant execute on function public.admin_bulk_allot(jsonb, public.allotment_kind, text, text, text, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Cancelled for SEE
-- ---------------------------------------------------------------------------

create or replace function public.admin_cancel_semester_classes(p_date date, p_semesters text[], p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  d record;
  v_n int := 0;
  v_why text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'semester ' || array_to_string(p_semesters, ', '));
  v_reason text := case when v_why ~* '^SEE\M' then 'Cancelled for SEE: ' else 'Cancelled for CIE: ' end || v_why;
begin
  if coalesce(array_length(p_semesters, 1), 0) = 0 then
    raise exception 'Pick at least one semester' using errcode = 'P0001';
  end if;
  for d in
    select s.* from public.get_day_schedule(p_date) s
     where s.status in ('class', 'booked')
       and not public.slot_has_started(p_date, s.slot_id)
       and public.subject_semesters(s.subject) && p_semesters
  loop
    insert into public.allotments (room_id, date, slot_id, kind, title, faculty_name, reason, created_by)
    values (d.room_id, p_date, d.slot_id, 'drop', coalesce(d.subject, 'Class'), d.faculty_name, v_reason, me.email);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

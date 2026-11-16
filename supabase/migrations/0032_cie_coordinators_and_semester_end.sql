-- 0032:
-- 1. A CIE is taken by the CIE Co-ordinators: every CIE allotment shows "CIE Co-ordinators" as
--    its faculty, however it was allotted (Allot page, CIE week, an edit or a rename).
-- 2. Semester end: when a semester's classes end, its rooms are released. From the day after its
--    last day (or from today, for a day already gone by) the timetable no longer has that
--    semester's classes, so its rooms show as free and can be requested. Bookings made by faculty
--    or admins stay. It works like every timetable edit: a new timetable version from that day,
--    so past days keep the timetable they had. It can be undone.
-- Depends on 0030 (subject_semesters). Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. CIE Co-ordinators
-- ---------------------------------------------------------------------------

create or replace function public.allotments_cie_coordinators() returns trigger
language plpgsql as $$
begin
  if new.kind = 'cie' then
    new.faculty_name := 'CIE Co-ordinators';
  end if;
  return new;
end $$;
drop trigger if exists allotments_cie_coordinators on public.allotments;
create trigger allotments_cie_coordinators before insert on public.allotments
  for each row execute function public.allotments_cie_coordinators();

-- ---------------------------------------------------------------------------
-- 2. Semester end
-- ---------------------------------------------------------------------------

create table if not exists public.semester_ends (
  semester   text primary key check (semester ~ '^\d$'),
  last_day   date not null,
  created_by text not null,
  created_at timestamptz not null default now()
);
alter table public.semester_ends enable row level security;
drop policy if exists "anyone reads semester ends" on public.semester_ends;
create policy "anyone reads semester ends" on public.semester_ends for select using (true);
grant select on public.semester_ends to anon, authenticated;

drop trigger if exists log_activity on public.semester_ends;
create trigger log_activity after insert or update or delete on public.semester_ends
  for each row execute function public.log_activity();

-- The timetable version in force on a day
create or replace function public.version_on(p_date date) returns public.timetable_versions
language sql stable set search_path = public as $$
  select v.* from public.timetable_versions v
   where p_date between v.valid_from and v.valid_to
   order by v.valid_from desc, v.id desc limit 1
$$;

-- A new timetable version from p_from: the one in force that day, without the classes of every
-- semester that has ended by then, plus (when p_add is set) that semester's classes from the
-- version p_base, in cells nothing else has taken. A class shared with a running semester stays.
create or replace function public.semester_version(p_from date, p_name text, p_add text default null, p_base int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_src public.timetable_versions := public.version_on(p_from);
  v_ended text[];
  v_new int;
begin
  if v_src.id is null then
    return;
  end if;
  select coalesce(array_agg(semester), '{}') into v_ended from public.semester_ends where last_day < p_from;

  insert into public.timetable_versions (name, valid_from, valid_to)
  values (p_name, p_from, v_src.valid_to)
  returning id into v_new;

  insert into public.timetable_entries (version_id, room_id, weekday, slot_id, subject, faculty_initials, faculty_label, is_department)
  select v_new, t.room_id, t.weekday, t.slot_id, t.subject, t.faculty_initials, t.faculty_label, t.is_department
    from public.timetable_entries t
   where t.version_id = v_src.id
     and not (cardinality(public.subject_semesters(t.subject)) > 0
              and public.subject_semesters(t.subject) <@ v_ended);

  if p_add is not null and p_base is not null then
    insert into public.timetable_entries (version_id, room_id, weekday, slot_id, subject, faculty_initials, faculty_label, is_department)
    select v_new, b.room_id, b.weekday, b.slot_id, b.subject, b.faculty_initials, b.faculty_label, b.is_department
      from public.timetable_entries b
     where b.version_id = p_base
       and p_add = any (public.subject_semesters(b.subject))
       and not (public.subject_semesters(b.subject) <@ v_ended)
       and not exists (select 1 from public.timetable_entries t
                        where t.version_id = v_new and t.room_id = b.room_id
                          and t.weekday = b.weekday and t.slot_id = b.slot_id);
  end if;
end $$;
revoke execute on function public.semester_version(date, text, text, int) from public, anon, authenticated;

-- The day a change starts, and the start of every later timetable version (a later upload or
-- edit would otherwise bring the old classes back, or keep them away)
create or replace function public.semester_change_days(p_from date) returns setof date
language sql stable set search_path = public as $$
  select p_from
  union
  select v.valid_from from public.timetable_versions v where v.valid_from > p_from
  order by 1
$$;

-- Ends a semester's classes after p_last_day. Returns the first day without them.
create or replace function public.admin_end_semester(p_semester text, p_last_day date)
returns date language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_sem text := btrim(coalesce(p_semester, ''));
  v_from date;
  d date;
begin
  if v_sem !~ '^\d$' then
    raise exception 'Pick a semester' using errcode = 'P0001';
  end if;
  if p_last_day is null then
    raise exception 'Pick the last day of classes' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.semester_ends where semester = v_sem) then
    raise exception 'Classes of semester % have already been ended. Undo that first to change the date.', v_sem using errcode = 'P0001';
  end if;
  -- Past days keep the timetable they had
  v_from := greatest(p_last_day + 1, public.ist_today());
  if (public.version_on(v_from)).id is null then
    raise exception 'There is no timetable after that day' using errcode = 'P0001';
  end if;

  insert into public.semester_ends (semester, last_day, created_by) values (v_sem, p_last_day, me.email);
  for d in select * from public.semester_change_days(v_from) loop
    perform public.semester_version(d, 'Semester ' || v_sem || ' classes ended on ' || to_char(p_last_day, 'DD/MM/YYYY') || ', by ' || me.email);
  end loop;
  return v_from;
end $$;

-- Brings a semester's classes back, from today (or from after its last day, if that is still to come).
create or replace function public.admin_undo_semester_end(p_semester text)
returns date language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  r public.semester_ends;
  v_from date;
  v_base int;
  d date;
begin
  select * into r from public.semester_ends where semester = btrim(coalesce(p_semester, ''));
  if r.semester is null then
    raise exception 'That semester''s classes have not been ended' using errcode = 'P0001';
  end if;
  v_from := greatest(r.last_day + 1, public.ist_today());
  -- The timetable on the semester's last day still has its classes
  v_base := (public.version_on(r.last_day)).id;
  delete from public.semester_ends where semester = r.semester;
  for d in select * from public.semester_change_days(v_from) loop
    perform public.semester_version(d, 'Semester ' || r.semester || ' classes brought back, by ' || me.email, r.semester, v_base);
  end loop;
  return v_from;
end $$;

grant execute on function public.version_on(date) to anon, authenticated;
revoke execute on function public.admin_end_semester(text, date) from public, anon;
grant execute on function public.admin_end_semester(text, date) to authenticated;
revoke execute on function public.admin_undo_semester_end(text) from public, anon;
grant execute on function public.admin_undo_semester_end(text) to authenticated;

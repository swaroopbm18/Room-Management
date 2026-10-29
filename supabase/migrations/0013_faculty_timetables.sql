-- Faculty timetables, free time and meeting times.
-- A faculty member's week is their classes in the room timetable (matched by initials) plus
-- any other duties an admin adds here: labs elsewhere, proctoring, committee work and so on.
-- Admins see every faculty member's week, the free faculty in each slot, and suggested
-- meeting times. Duties are a weekly pattern, not tied to dates.

create table public.faculty_duties (
  initials   text not null check (length(btrim(initials)) > 0),
  weekday    smallint not null check (weekday between 1 and 6),  -- ISO: 1 = Monday
  slot_id    smallint not null references public.slots(id),
  activity   text not null check (length(btrim(activity)) > 0 and length(activity) <= 60),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (initials, weekday, slot_id)
);
alter table public.faculty_duties enable row level security;
create policy "admins read faculty duties" on public.faculty_duties for select using (public.is_admin());
grant select on public.faculty_duties to authenticated;

-- Set or clear (empty activity) one or more slots of one faculty member on one weekday.
create or replace function public.admin_set_faculty_duty(p_initials text, p_weekday int, p_slots int[], p_activity text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_initials text := upper(btrim(coalesce(p_initials, '')));
  v_activity text := regexp_replace(btrim(coalesce(p_activity, '')), '\s+', ' ', 'g');
begin
  if v_initials = '' then
    raise exception 'Pick a faculty member' using errcode = 'P0001';
  end if;
  if p_weekday not between 1 and 6 then
    raise exception 'Pick a day from Monday to Saturday' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_slots, 1), 0) = 0 then
    raise exception 'Pick at least one slot' using errcode = 'P0001';
  end if;
  if length(v_activity) > 60 then
    raise exception 'Keep the duty under 60 characters' using errcode = 'P0001';
  end if;
  delete from public.faculty_duties where initials = v_initials and weekday = p_weekday and slot_id = any (p_slots);
  if v_activity <> '' then
    insert into public.faculty_duties (initials, weekday, slot_id, activity, updated_by)
    select v_initials, p_weekday, s.id, v_activity, me.email from public.slots s where s.id = any (p_slots);
  end if;
end $$;

-- Replace all duties of the faculty members listed in p_initials with p_entries
-- ([{initials, weekday, slot_id, activity}]), e.g. from an uploaded file. Returns the rows saved.
create or replace function public.admin_replace_faculty_duties(p_initials text[], p_entries jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_count int;
begin
  if coalesce(array_length(p_initials, 1), 0) = 0 then
    raise exception 'The file has no faculty timetables' using errcode = 'P0001';
  end if;
  delete from public.faculty_duties where initials = any (select upper(btrim(i)) from unnest(p_initials) i);
  insert into public.faculty_duties (initials, weekday, slot_id, activity, updated_by)
  select distinct on (upper(btrim(e.initials)), e.weekday, e.slot_id)
         upper(btrim(e.initials)), e.weekday, e.slot_id, left(regexp_replace(btrim(e.activity), '\s+', ' ', 'g'), 60), me.email
    from jsonb_to_recordset(p_entries) as e(initials text, weekday int, slot_id int, activity text)
   where upper(btrim(e.initials)) = any (select upper(btrim(i)) from unnest(p_initials) i)
     and e.weekday between 1 and 6
     and exists (select 1 from public.slots s where s.id = e.slot_id)
     and btrim(coalesce(e.activity, '')) <> '';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

grant execute on function public.admin_set_faculty_duty(text, int, int[], text),
                          public.admin_replace_faculty_duties(text[], jsonb) to authenticated;

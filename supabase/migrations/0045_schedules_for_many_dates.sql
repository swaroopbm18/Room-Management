-- 0045: The day's rooms, free and busy faculty and the timetable for several dates in one call.
--
-- Pages that look at more than one day (the admin dashboard's clash warnings, Leave, Room week,
-- Find a meeting time, substitutes for a dropped class) asked the database once per day, so a
-- two-week page made up to 14 round trips. These read every date in one call and return the same
-- rows as the one-day functions, with the date in front. They run the one-day functions
-- underneath, so who sees what is unchanged. At most 31 dates are read per call.
--
-- Depends on 0044. Safe to run more than once. The site falls back to one call per day until it
-- is run.

create or replace function public.get_day_schedule_many(p_dates date[])
returns table (on_date date, room_id text, room_name text, slot_id smallint, slot_label text, starts time, ends time, status text, subject text, faculty_name text, reason text, is_mine boolean, ended boolean, original_subject text, original_faculty text)
language sql stable security invoker set search_path = public set jit = off as $$
  select d.d, s.*
  from (select distinct x as d from unnest(p_dates[1:31]) x) d
  cross join lateral public.get_day_schedule(d.d) s;
$$;
grant execute on function public.get_day_schedule_many(date[]) to anon, authenticated;

create or replace function public.faculty_status_many(p_dates date[])
returns table (on_date date, initials text, name text, cluster text, slot_id smallint, busy boolean, activity text, room_id text)
language sql stable security invoker set search_path = public set jit = off as $$
  select d.d, s.*
  from (select distinct x as d from unnest(p_dates[1:31]) x) d
  cross join lateral public.faculty_status(d.d) s;
$$;
grant execute on function public.faculty_status_many(date[]) to anon, authenticated;

create or replace function public.get_timetable_many(p_dates date[])
returns table (on_date date, room_id text, slot_id int, subject text, faculty_initials text[], faculty_name text, is_department boolean)
language sql stable security invoker set search_path = public set jit = off as $$
  select d.d, s.*
  from (select distinct x as d from unnest(p_dates[1:31]) x) d
  cross join lateral public.get_timetable(d.d) s;
$$;
grant execute on function public.get_timetable_many(date[]) to anon, authenticated;

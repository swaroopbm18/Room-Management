-- 0031: Class changes in one call.
-- The Class changes page read each day's timetable and room schedule separately, two calls per
-- day for a week (14 calls). get_class_days returns every day of a range in one call, each day
-- with its regular timetable (as get_timetable) and what each room is doing (as get_day_schedule).
-- Safe to run more than once.

create or replace function public.get_class_days(p_from date, p_to date)
returns table (day date, timetable jsonb, schedule jsonb)
language sql stable set search_path = public as $$
  select d::date,
         coalesce((select jsonb_agg(to_jsonb(t)) from public.get_timetable(d::date) t), '[]'::jsonb),
         coalesce((select jsonb_agg(to_jsonb(s)) from public.get_day_schedule(d::date) s), '[]'::jsonb)
  from generate_series(p_from, least(p_to, p_from + 31), interval '1 day') d
  order by 1
$$;

grant execute on function public.get_class_days(date, date) to anon, authenticated;

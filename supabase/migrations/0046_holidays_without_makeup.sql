-- 0046: Holidays that need no make-up day.
--
-- Calendar & notices suggests make-up Sundays for every recent or upcoming holiday on a working
-- day until a make-up day is saved for it. Some holidays are never made up, so an admin can now
-- mark one "No make-up day": it drops out of the suggestions and the make-up form, and can be put
-- back. Nothing else changes: a holiday shows no classes either way.
--
-- A table of its own rather than a column on holidays, because holidays_guard keeps past holidays
-- as they were, and a holiday from last week can still be marked. Removing or moving a holiday
-- takes its mark with it.
--
-- Safe to run more than once. Until it is run, the page works as before and the button says the
-- table is missing.

create table if not exists public.holidays_without_makeup (
  holiday date primary key references public.holidays(date) on update cascade on delete cascade,
  created_by text not null,
  created_at timestamptz not null default now()
);

alter table public.holidays_without_makeup enable row level security;
grant select on table public.holidays_without_makeup to anon, authenticated;

drop policy if exists "anyone reads holidays without make-up" on public.holidays_without_makeup;
create policy "anyone reads holidays without make-up" on public.holidays_without_makeup for select using (true);

drop trigger if exists log_activity on public.holidays_without_makeup;
create trigger log_activity after insert or delete or update on public.holidays_without_makeup
  for each row execute function public.log_activity();

-- Mark a holiday as needing no make-up day (p_needed false), or as needing one again (true).
create or replace function public.admin_set_holiday_makeup(p_date date, p_needed boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me public.people := public.require_admin();
begin
  if not exists (select 1 from public.holidays where date = p_date) then
    raise exception 'That holiday was removed' using errcode = 'P0001';
  end if;
  if p_needed then
    delete from public.holidays_without_makeup where holiday = p_date;
  else
    insert into public.holidays_without_makeup (holiday, created_by) values (p_date, me.email)
    on conflict (holiday) do nothing;
  end if;
end $$;

revoke all on function public.admin_set_holiday_makeup(date, boolean) from public, anon;
grant execute on function public.admin_set_holiday_makeup(date, boolean) to authenticated;

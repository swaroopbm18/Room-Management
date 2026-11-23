-- 0039: Count what waits for an admin in the database.
-- The Admin link and the admin menu show how many room requests (one per request, however many
-- slots it covers) and accepted class exchanges wait for a decision. The website used to download
-- every pending row to count them; this returns the number in one call.
-- Admins only: anyone else gets 0. Safe to run more than once. The website still works without
-- it (it falls back to counting the old way).

create or replace function public.pending_admin_count() returns int
language sql stable security definer set search_path = public as $$
  select case when not public.is_admin() then 0 else
    (select count(distinct group_id)::int from public.requests
      where status = 'pending' and date >= (now() at time zone 'Asia/Kolkata')::date)
    + (select count(*)::int from public.class_exchanges
      where status = 'accepted' and date >= (now() at time zone 'Asia/Kolkata')::date)
  end;
$$;

revoke execute on function public.pending_admin_count() from public, anon;
grant execute on function public.pending_admin_count() to authenticated;

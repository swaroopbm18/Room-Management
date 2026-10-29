-- The department's faculty are split into two groups, Cluster A and Cluster B, each under its
-- own HoD. Admins put each faculty member (by timetable initials) in one cluster; the free-time
-- page and the meeting finder then work per cluster. Depends only on 0001.

create table public.faculty_clusters (
  initials   text primary key check (length(btrim(initials)) > 0),
  cluster    text not null check (cluster in ('A', 'B')),
  updated_by text not null,
  updated_at timestamptz not null default now()
);
alter table public.faculty_clusters enable row level security;
create policy "admins read faculty clusters" on public.faculty_clusters for select using (public.is_admin());
grant select on public.faculty_clusters to authenticated;

-- Set the cluster of every faculty member in p_entries ([{initials, cluster}]). An empty
-- cluster takes them out of both. Faculty not in the list keep their cluster. Returns the rows changed.
create or replace function public.admin_set_faculty_clusters(p_entries jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_count int := 0;
  v_n int;
begin
  drop table if exists pg_temp.cluster_incoming;
  create temp table cluster_incoming on commit drop as
  select distinct on (upper(btrim(e.initials))) upper(btrim(e.initials)) as initials, nullif(upper(btrim(coalesce(e.cluster, ''))), '') as cluster
    from jsonb_to_recordset(p_entries) as e(initials text, cluster text)
   where btrim(coalesce(e.initials, '')) <> '';
  if exists (select 1 from cluster_incoming where cluster is not null and cluster not in ('A', 'B')) then
    raise exception 'A cluster must be A or B' using errcode = 'P0001';
  end if;

  delete from public.faculty_clusters c using cluster_incoming i where c.initials = i.initials and i.cluster is null;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;
  insert into public.faculty_clusters (initials, cluster, updated_by)
  select initials, cluster, me.email from cluster_incoming where cluster is not null
  on conflict (initials) do update set cluster = excluded.cluster, updated_by = excluded.updated_by, updated_at = now()
   where faculty_clusters.cluster is distinct from excluded.cluster;
  get diagnostics v_n = row_count;
  return v_count + v_n;
end $$;
grant execute on function public.admin_set_faculty_clusters(jsonb) to authenticated;

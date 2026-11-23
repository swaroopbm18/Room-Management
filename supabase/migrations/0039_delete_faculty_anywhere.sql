-- 0039: Delete any faculty record, even one the timetable still uses.
-- A stray record (for example the typo LKB that should have been LBK) could not be deleted while
-- any timetable version still named it, and the old versions always do, because records are
-- permanent. Now an admin can:
--   * merge it into the right faculty member: their classes, duties, cluster, leave and pending
--     exchanges move to that person, and the typo is remembered so a later Word upload with the
--     same typo is read as the right initials, or
--   * delete it outright: it is taken off every class it is on (the class stays, with the other
--     faculty, or none), and its name, cluster, duties, leave and sign-in go.
-- Timetable changes take effect from tomorrow as a new timetable version, like every other edit,
-- so earlier days keep what was recorded. Each changed cell is in the timetable history.
-- "Still in the timetable" now means the timetable from tomorrow on, not any version ever made, so
-- a faculty member whose classes were given to someone else can be deleted the normal way too.
-- Depends on 0022 (admin_delete_faculty) and 0016 (faculty_directory). Safe to run more than once.

-- Typos merged into the right initials, applied to any timetable cell saved later
create table if not exists public.faculty_aliases (
  alias text primary key check (alias ~ '^[A-Z][A-Z.]{0,9}$'),
  initials text not null check (initials ~ '^[A-Z][A-Z.]{0,9}$' and initials <> alias),
  created_by text not null,
  created_at timestamptz not null default now()
);
alter table public.faculty_aliases enable row level security;
drop policy if exists "anyone reads faculty aliases" on public.faculty_aliases;
create policy "anyone reads faculty aliases" on public.faculty_aliases for select using (true);
grant select on public.faculty_aliases to authenticated;

-- The timetable versions that are (or will be) in effect from p_from on: the one in effect that
-- day, and any that start later.
create or replace function public.live_timetable_versions(p_from date)
returns setof int language sql stable security definer set search_path = public set jit = off as $$
  (select v.id from public.timetable_versions v
    where p_from between v.valid_from and v.valid_to
    order by v.valid_from desc, v.id desc limit 1)
  union
  select v.id from public.timetable_versions v where v.valid_from > p_from
$$;
revoke execute on function public.live_timetable_versions(date) from public, anon;
grant execute on function public.live_timetable_versions(date) to authenticated;

-- One cell's faculty with p_old swapped for p_new (or dropped, when p_new is null), keeping the
-- order and the matching label, and naming nobody twice.
create or replace function public.swap_faculty(p_initials text[], p_label text, p_old text, p_new text,
                                               out initials text[], out label text)
language sql immutable as $$
  with x as (
    select i.ord,
           case when i.ini = p_old then p_new else i.ini end as ini,
           case when i.ini = p_old then coalesce(nullif(replace(split_part(p_label, ', ', i.ord::int), p_old, p_new), ''), p_new)
                else nullif(split_part(p_label, ', ', i.ord::int), '') end as lab
      from unnest(p_initials) with ordinality as i(ini, ord)
  ),
  y as (select distinct on (ini) ord, ini, lab from x where ini is not null order by ini, ord)
  select coalesce((select array_agg(ini order by ord) from y), '{}'),
         coalesce((select string_agg(coalesce(lab, ini), ', ' order by ord) from y), '')
$$;

-- A cell saved with a remembered typo gets the right initials, unless someone now really has them
create or replace function public.timetable_entries_apply_aliases() returns trigger
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  for a in select f.alias, f.initials from public.faculty_aliases f
            where f.alias = any (new.faculty_initials)
              and not exists (select 1 from public.faculty_directory d where d.initials = f.alias)
              and not exists (select 1 from public.people p where p.initials = f.alias) loop
    select s.initials, s.label into new.faculty_initials, new.faculty_label
      from public.swap_faculty(new.faculty_initials, new.faculty_label, a.alias, a.initials) s;
  end loop;
  return new;
end $$;
drop trigger if exists timetable_entries_apply_aliases on public.timetable_entries;
create trigger timetable_entries_apply_aliases before insert on public.timetable_entries
  for each row execute function public.timetable_entries_apply_aliases();

-- Merge p_initials into p_into, or delete it when p_into is empty, whatever the timetable says.
-- Returns {"slots": class slots changed from tomorrow, "account": null | "deleted" | "kept_history" | "moved"}.
create or replace function public.admin_purge_faculty(p_initials text, p_into text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_ini text := upper(btrim(coalesce(p_initials, '')));
  v_into text := nullif(upper(btrim(coalesce(p_into, ''))), '');
  v_from date := public.ist_today() + 1;
  v_src public.timetable_versions;
  v_new int;
  v_slots int := 0;
  v_person public.people;
  v_account text;
begin
  if v_ini = '' then
    raise exception 'Pick a faculty member to delete' using errcode = 'P0001';
  end if;
  if me.initials = v_ini then
    raise exception 'You cannot delete yourself' using errcode = 'P0001';
  end if;
  if v_into = v_ini then
    raise exception 'Pick someone other than % to give their classes to', v_ini using errcode = 'P0001';
  end if;
  if v_into is not null and v_into !~ '^[A-Z][A-Z.]{0,9}$' then
    raise exception 'Initials must be 1 to 10 letters, e.g. AKN' using errcode = 'P0001';
  end if;
  select * into v_person from public.people where initials = v_ini;
  if v_into is not null and v_person.email is not null and exists (select 1 from public.people where initials = v_into) then
    raise exception '% and % both sign in with their own accounts. Delete the wrong account under Sign-in list first.', v_ini, v_into
      using errcode = 'P0001';
  end if;

  -- 1. The timetable from tomorrow on: a new version of each live version that names them
  for v_src in select v.* from public.timetable_versions v
                where v.id in (select public.live_timetable_versions(v_from))
                  and exists (select 1 from public.timetable_entries t where t.version_id = v.id and v_ini = any (t.faculty_initials))
                order by v.valid_from, v.id loop
    insert into public.timetable_versions (name, valid_from, valid_to)
    values (case when v_into is null then v_ini || ' deleted' else v_ini || ' merged into ' || v_into end
              || ' by ' || me.email || ' on ' || to_char(public.ist_today(), 'DD/MM/YYYY'),
            greatest(v_src.valid_from, v_from), v_src.valid_to)
    returning id into v_new;

    insert into public.timetable_entries (version_id, room_id, weekday, slot_id, subject, faculty_initials, faculty_label, is_department)
    select v_new, t.room_id, t.weekday, t.slot_id, t.subject,
           case when v_ini = any (t.faculty_initials) then s.initials else t.faculty_initials end,
           case when v_ini = any (t.faculty_initials) then s.label else t.faculty_label end,
           t.is_department
      from public.timetable_entries t
      cross join lateral public.swap_faculty(t.faculty_initials, t.faculty_label, v_ini, v_into) s
     where t.version_id = v_src.id;

    insert into public.timetable_changes (version_id, room_id, weekday, slot_ids, old_value, new_value, effective_from, changed_by)
    select v_new, o.room_id, o.weekday, array[o.slot_id]::smallint[],
           o.subject || coalesce(' (' || nullif(o.faculty_label, '') || ')', ''),
           n.subject || coalesce(' (' || nullif(n.faculty_label, '') || ')', ''),
           greatest(v_src.valid_from, v_from), me.email
      from public.timetable_entries o
      join public.timetable_entries n on n.version_id = v_new and n.room_id = o.room_id and n.weekday = o.weekday and n.slot_id = o.slot_id
     where o.version_id = v_src.id and v_ini = any (o.faculty_initials)
     order by o.room_id, o.weekday, o.slot_id;

    -- Counted once, from the version in effect tomorrow
    if v_slots = 0 then
      select count(*) into v_slots from public.timetable_entries t
       where t.version_id = v_src.id and v_ini = any (t.faculty_initials) and not t.is_department;
    end if;
  end loop;

  -- 2. Everything else that names them
  if v_into is not null then
    insert into public.faculty_duties (initials, weekday, slot_id, activity, updated_by)
    select v_into, d.weekday, d.slot_id, d.activity, me.email from public.faculty_duties d where d.initials = v_ini
    on conflict do nothing;
    insert into public.faculty_clusters (initials, cluster, updated_by)
    select v_into, c.cluster, me.email from public.faculty_clusters c where c.initials = v_ini
    on conflict do nothing;
    update public.faculty_leave set initials = v_into where initials = v_ini;
    update public.class_exchanges set target_initials = v_into where target_initials = v_ini and status in ('pending', 'accepted');
    update public.class_exchanges set requester_initials = v_into where requester_initials = v_ini and status in ('pending', 'accepted');
    -- The right person keeps their own name; a name only the typo had moves to them
    insert into public.faculty_directory (initials, title, full_name)
    select v_into, d.title, d.full_name from public.faculty_directory d where d.initials = v_ini and btrim(d.full_name) <> ''
    on conflict (initials) do update set title = excluded.title, full_name = excluded.full_name
      where btrim(public.faculty_directory.full_name) = '';
    -- Remember the typo, and point older typos of it to the right person too
    update public.faculty_aliases set initials = v_into where initials = v_ini;
    delete from public.faculty_aliases where alias = v_into or alias = initials;
    insert into public.faculty_aliases (alias, initials, created_by) values (v_ini, v_into, me.email)
    on conflict (alias) do update set initials = excluded.initials, created_by = excluded.created_by, created_at = now();
  else
    delete from public.faculty_leave where initials = v_ini;
    update public.class_exchanges set status = 'withdrawn', decided_at = now(), decided_by = me.email
     where (target_initials = v_ini or requester_initials = v_ini) and status in ('pending', 'accepted');
    delete from public.faculty_aliases where initials = v_ini;
  end if;
  delete from public.faculty_duties where initials = v_ini;
  delete from public.faculty_clusters where initials = v_ini;
  delete from public.faculty_directory where initials = v_ini;

  -- 3. Their sign-in: moved to the right initials when merging, otherwise removed
  if v_person.email is not null then
    if v_into is not null then
      update public.people set initials = v_into where email = v_person.email;
      v_account := 'moved';
    else
      delete from public.faculty_subjects where email = v_person.email;
      update public.requests set status = 'withdrawn', decided_at = now(), decided_by = me.email
       where requester_email = v_person.email and status = 'pending';
      if exists (select 1 from public.requests where requester_email = v_person.email) then
        -- Kept only so past requests still say who made them; they can't sign in and have no card
        update public.people set initials = null, active = false, role = 'faculty' where email = v_person.email;
        v_account := 'kept_history';
      else
        delete from public.people where email = v_person.email;
        v_account := 'deleted';
      end if;
    end if;
  end if;
  return jsonb_build_object('slots', v_slots, 'account', v_account);
end $$;
revoke execute on function public.admin_purge_faculty(text, text) from public, anon;
grant execute on function public.admin_purge_faculty(text, text) to authenticated;

-- The plain delete still stops while they teach, but only counts the timetable from tomorrow on
create or replace function public.admin_delete_faculty(p_initials text)
returns text language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_ini text := upper(btrim(coalesce(p_initials, '')));
  v_classes int;
begin
  select count(*) into v_classes
    from public.timetable_entries t
   where t.version_id in (select public.live_timetable_versions(public.ist_today() + 1))
     and v_ini = any (t.faculty_initials) and not t.is_department;
  if v_classes > 0 then
    raise exception '% still has % class slot(s) in the timetable. Open their profile and use Delete to give those classes to someone else or remove them.', v_ini, v_classes
      using errcode = 'P0001';
  end if;
  return coalesce(public.admin_purge_faculty(v_ini, null) ->> 'account', 'deleted');
end $$;
revoke execute on function public.admin_delete_faculty(text) from public, anon;
grant execute on function public.admin_delete_faculty(text) to authenticated;

-- Admins can forget a remembered typo
create or replace function public.admin_remove_faculty_alias(p_alias text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.people := public.require_admin();
begin
  delete from public.faculty_aliases where alias = upper(btrim(coalesce(p_alias, '')));
end $$;
revoke execute on function public.admin_remove_faculty_alias(text) from public, anon;
grant execute on function public.admin_remove_faculty_alias(text) to authenticated;

-- Subjects (and the "in the timetable" list on Sign-in list & names) come from the timetable in
-- effect from tomorrow on, like the faculty cards, not from versions that have been replaced
create or replace function public.timetable_subjects()
returns table(initials text, subject text) language sql stable security definer set search_path = public set jit = off as $$
  select distinct i.ini, upper(btrim(t.subject))
    from public.timetable_entries t
    cross join lateral unnest(t.faculty_initials) as i(ini)
   where t.version_id in (select public.live_timetable_versions(public.ist_today() + 1))
     and not t.is_department and btrim(t.subject) <> '' and length(btrim(t.subject)) <= 40
$$;

-- The activity log covers the remembered typos too
do $$
begin
  if exists (select 1 from pg_proc where proname = 'log_activity' and pronamespace = 'public'::regnamespace) then
    drop trigger if exists log_activity on public.faculty_aliases;
    create trigger log_activity after insert or update or delete on public.faculty_aliases
      for each row execute function public.log_activity();
  end if;
end $$;

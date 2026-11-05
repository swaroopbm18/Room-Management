-- 1. Admins can delete a faculty member: their directory name, cluster, duties and subjects go,
--    and their sign-in is removed. Someone with requests on record keeps a sign-in row (so the
--    history still says who asked), but it loses its initials and access. Their pending
--    requests are withdrawn. Faculty who still teach in the timetable from tomorrow on can't be
--    deleted, so the timetable never names someone who isn't there.
-- 2. Admins can add extra rooms, and delete a room that has no classes or bookings on record.
-- Depends on 0013 (faculty_duties), 0014 (faculty_clusters), 0016 and 0020 (room details).

create or replace function public.admin_delete_faculty(p_initials text)
returns text language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_ini text := upper(btrim(coalesce(p_initials, '')));
  v_person public.people;
  v_classes int;
begin
  if v_ini = '' then
    raise exception 'Pick a faculty member to delete' using errcode = 'P0001';
  end if;
  if me.initials = v_ini then
    raise exception 'You cannot delete yourself' using errcode = 'P0001';
  end if;

  select count(*) into v_classes
  from public.timetable_entries t
  join public.timetable_versions v on v.id = t.version_id
  where v.valid_to >= public.ist_today() + 1 and v_ini = any (t.faculty_initials);
  if v_classes > 0 then
    raise exception '% still has % class slot(s) in the timetable. Move those classes to someone else in Class timetables first, then delete.', v_ini, v_classes
      using errcode = 'P0001';
  end if;

  delete from public.faculty_duties where initials = v_ini;
  delete from public.faculty_clusters where initials = v_ini;
  delete from public.faculty_directory where initials = v_ini;

  select * into v_person from public.people where initials = v_ini;
  if v_person.email is null then
    return 'deleted';
  end if;
  delete from public.faculty_subjects where email = v_person.email;
  update public.requests set status = 'withdrawn', decided_at = now(), decided_by = me.email
   where requester_email = v_person.email and status = 'pending';
  if exists (select 1 from public.requests where requester_email = v_person.email) then
    -- Kept only so past requests still say who made them; they can't sign in and have no card
    update public.people set initials = null, active = false, role = 'faculty' where email = v_person.email;
    return 'kept_history';
  end if;
  delete from public.people where email = v_person.email;
  return 'deleted';
end $$;
revoke execute on function public.admin_delete_faculty(text) from public, anon;
grant execute on function public.admin_delete_faculty(text) to authenticated;

-- A room as the Word timetable writes it, e.g. MEL-CR-509: letters, digits and dashes.
create or replace function public.admin_add_room(p_room text, p_capacity int, p_kind text, p_projector boolean, p_notes text)
returns text language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_id text := upper(regexp_replace(coalesce(p_room, ''), '\s+', '', 'g'));
begin
  if v_id !~ '^[A-Z0-9][A-Z0-9-]{0,23}$' then
    raise exception 'Room names are 1 to 24 letters, digits or dashes, e.g. MEL-CR-509' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.rooms where id = v_id) then
    raise exception 'Room % is already on the site', v_id using errcode = 'P0001';
  end if;
  insert into public.rooms (id, name, sort_order, capacity, kind, projector, notes)
  values (v_id, v_id, coalesce((select max(sort_order) + 1 from public.rooms), 0),
          p_capacity, coalesce(nullif(p_kind, ''), 'classroom'), coalesce(p_projector, false), btrim(coalesce(p_notes, '')));
  return v_id;
end $$;
revoke execute on function public.admin_add_room(text, int, text, boolean, text) from public, anon;
grant execute on function public.admin_add_room(text, int, text, boolean, text) to authenticated;

-- Only a room with nothing on record: no classes in any timetable, no requests and no bookings.
create or replace function public.admin_delete_room(p_room text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.people := public.require_admin();
begin
  if not exists (select 1 from public.rooms where id = p_room) then
    raise exception 'No such room' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.timetable_entries where room_id = p_room)
     or exists (select 1 from public.timetable_changes where room_id = p_room) then
    raise exception 'Room % has classes in the timetable (now or in the past), so deleting it would change old records. Clear its classes instead.', p_room
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.requests where room_id = p_room)
     or exists (select 1 from public.allotments where room_id = p_room) then
    raise exception 'Room % has requests or bookings on record, so it can''t be deleted without losing history.', p_room
      using errcode = 'P0001';
  end if;
  delete from public.rooms where id = p_room;
end $$;
revoke execute on function public.admin_delete_room(text) from public, anon;
grant execute on function public.admin_delete_room(text) to authenticated;

-- Rooms that have something on record, so the Room details page only offers Delete for the rest.
create or replace function public.admin_rooms_in_use()
returns setof text language sql stable security definer set search_path = public as $$
  select r.id from public.rooms r
  where public.is_admin() and (
    exists (select 1 from public.timetable_entries t where t.room_id = r.id)
    or exists (select 1 from public.timetable_changes c where c.room_id = r.id)
    or exists (select 1 from public.requests q where q.room_id = r.id)
    or exists (select 1 from public.allotments a where a.room_id = r.id))
$$;
revoke execute on function public.admin_rooms_in_use() from public, anon;
grant execute on function public.admin_rooms_in_use() to authenticated;

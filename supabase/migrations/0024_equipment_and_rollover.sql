-- 1. Equipment booking: admins list portable equipment (projectors, mics, speakers, lab kits);
--    any signed-in faculty member books an item for slots on a day, first come first served,
--    with the same clash rule as rooms: one booking per item per slot.
-- 2. Semester rollover: clear the last semester's duties, subjects and leave in one step, and
--    copy holidays to the next year.
-- Depends on 0023 (faculty_leave, activity log).

-- ---------------------------------------------------------------------------
-- 1. Equipment
-- ---------------------------------------------------------------------------

create table if not exists public.equipment (
  id         serial primary key,
  name       text not null unique check (length(btrim(name)) between 1 and 60),
  notes      text not null default '' check (length(notes) <= 120),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.equipment enable row level security;
drop policy if exists "anyone reads equipment" on public.equipment;
create policy "anyone reads equipment" on public.equipment for select using (true);
grant select on public.equipment to anon, authenticated;

create table if not exists public.equipment_bookings (
  id           bigserial primary key,
  equipment_id int not null references public.equipment(id),
  date         date not null,
  slot_id      smallint not null references public.slots(id),
  room_id      text references public.rooms(id),
  purpose      text not null default '' check (length(purpose) <= 120),
  booked_by    text not null,
  booked_name  text not null,
  created_at   timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by text
);
create unique index if not exists equipment_one_booking on public.equipment_bookings (equipment_id, date, slot_id) where cancelled_at is null;
create index if not exists equipment_bookings_date on public.equipment_bookings (date);
alter table public.equipment_bookings enable row level security;
drop policy if exists "staff read equipment bookings" on public.equipment_bookings;
create policy "staff read equipment bookings" on public.equipment_bookings for select using (public.is_staff());
grant select on public.equipment_bookings to authenticated;

create or replace function public.admin_save_equipment(p_id int, p_name text, p_notes text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me public.people := public.require_admin();
begin
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Name the equipment, e.g. Portable projector 1' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.equipment (name, notes) values (btrim(p_name), btrim(coalesce(p_notes, '')));
  else
    update public.equipment set name = btrim(p_name), notes = btrim(coalesce(p_notes, '')), active = coalesce(p_active, true) where id = p_id;
    if not found then
      raise exception 'No such equipment' using errcode = 'P0001';
    end if;
    -- Retiring an item cancels its future bookings
    if not coalesce(p_active, true) then
      update public.equipment_bookings set cancelled_at = now(), cancelled_by = me.email
       where equipment_id = p_id and cancelled_at is null and not public.slot_has_ended(date, slot_id);
    end if;
  end if;
exception when unique_violation then
  raise exception 'There is already equipment called %', btrim(p_name) using errcode = 'P0001';
end $$;
revoke execute on function public.admin_save_equipment(int, text, text, boolean) from public, anon;
grant execute on function public.admin_save_equipment(int, text, text, boolean) to authenticated;

create or replace function public.book_equipment(p_equipment int, p_date date, p_slots int[], p_room text, p_purpose text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.current_person();
  v_slot int;
  v_taken text;
begin
  if me.email is null or not me.active then
    raise exception 'Only registered faculty can book equipment' using errcode = '42501';
  end if;
  if not exists (select 1 from public.equipment where id = p_equipment and active) then
    raise exception 'That equipment can''t be booked' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_slots, 1), 0) = 0 then
    raise exception 'Pick at least one slot' using errcode = 'P0001';
  end if;
  if p_date > public.ist_today() + 28 then
    raise exception 'Equipment can be booked up to four weeks ahead' using errcode = 'P0001';
  end if;
  foreach v_slot in array p_slots loop
    if public.slot_has_ended(p_date, v_slot) then
      raise exception 'That slot has already ended' using errcode = 'P0001';
    end if;
    select booked_name into v_taken from public.equipment_bookings
     where equipment_id = p_equipment and date = p_date and slot_id = v_slot and cancelled_at is null;
    if v_taken is not null then
      raise exception 'Already booked by % in one of those slots', v_taken using errcode = 'P0001';
    end if;
    insert into public.equipment_bookings (equipment_id, date, slot_id, room_id, purpose, booked_by, booked_name)
    values (p_equipment, p_date, v_slot, nullif(p_room, ''), btrim(coalesce(p_purpose, '')), me.email, public.display_name(me));
  end loop;
end $$;
revoke execute on function public.book_equipment(int, date, int[], text, text) from public, anon;
grant execute on function public.book_equipment(int, date, int[], text, text) to authenticated;

-- Cancel your own booking (an admin can cancel anyone's), with the other slots booked with it
create or replace function public.cancel_equipment(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare b public.equipment_bookings;
begin
  select * into b from public.equipment_bookings where id = p_id and cancelled_at is null;
  if b.id is null then
    raise exception 'That booking was already cancelled' using errcode = 'P0001';
  end if;
  if b.booked_by <> public.current_email() and not public.is_admin() then
    raise exception 'You can only cancel your own bookings' using errcode = '42501';
  end if;
  update public.equipment_bookings set cancelled_at = now(), cancelled_by = public.current_email()
   where equipment_id = b.equipment_id and date = b.date and booked_by = b.booked_by
     and created_at = b.created_at and cancelled_at is null and not public.slot_has_ended(date, slot_id);
end $$;
revoke execute on function public.cancel_equipment(bigint) from public, anon;
grant execute on function public.cancel_equipment(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Semester rollover
-- ---------------------------------------------------------------------------

-- What to clear for a new semester. Returns a short summary of what was cleared.
create or replace function public.admin_rollover(p_duties boolean, p_subjects text, p_leave boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  n_duties int := 0;
  n_subjects int := 0;
  n_leave int := 0;
begin
  if p_duties then
    delete from public.faculty_duties;
    get diagnostics n_duties = row_count;
  end if;
  if p_subjects = 'timetable' then
    delete from public.faculty_subjects where source = 'timetable';
    get diagnostics n_subjects = row_count;
  elsif p_subjects = 'all' then
    delete from public.faculty_subjects;
    get diagnostics n_subjects = row_count;
  end if;
  if p_leave then
    delete from public.faculty_leave where ends_on < public.ist_today();
    get diagnostics n_leave = row_count;
  end if;
  return format('%s duty slots, %s subjects and %s past leave cleared', n_duties, n_subjects, n_leave);
end $$;
revoke execute on function public.admin_rollover(boolean, text, boolean) from public, anon;
grant execute on function public.admin_rollover(boolean, text, boolean) to authenticated;

-- The holidays between two dates, again p_years later (same date; movable festivals need a fix by hand)
create or replace function public.admin_copy_holidays(p_from date, p_to date, p_years int)
returns int language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  n int;
begin
  if p_years not between 1 and 2 then
    raise exception 'Copy holidays one or two years ahead' using errcode = 'P0001';
  end if;
  insert into public.holidays (date, name, created_by)
  select (h.date + make_interval(years => p_years))::date, h.name, me.email
  from public.holidays h
  where h.date between p_from and p_to
    and (h.date + make_interval(years => p_years))::date > public.ist_today()
  on conflict (date) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.admin_copy_holidays(date, date, int) from public, anon;
grant execute on function public.admin_copy_holidays(date, date, int) to authenticated;

-- The activity log follows equipment too
do $$
declare t text;
begin
  foreach t in array array['equipment', 'equipment_bookings'] loop
    execute format('drop trigger if exists log_activity on public.%I', t);
    execute format('create trigger log_activity after insert or update or delete on public.%I
                    for each row execute function public.log_activity()', t);
  end loop;
end $$;

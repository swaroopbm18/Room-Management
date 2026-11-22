-- 0038: Move an affected class.
-- A class whose room was taken (by a skill lab, an event or a booking) can be moved by an admin
-- to a free room at the same time, another time that day, or another day, from Admin → Rooms →
-- Affected classes. The website suggests the moves; this function saves one, all slots or none.
-- The moved class is a booked class whose description starts "Moved from <room>", like the
-- classes the skill lab moves (0037), so it shows the same way everywhere.
-- Also adds sections to an event or skill lab already booked (admin_add_sections).
-- Depends on 0037. Safe to run more than once.

-- p_from: where it was, e.g. "MEL-LAB-02, 8:00 AM – 9:50 AM" or "MEL-LAB-02, Tue 24 Nov, 8:00 AM – 9:50 AM"
-- p_why:  what took its room, e.g. "Skill Lab"
create or replace function public.admin_move_class(
  p_room text, p_date date, p_slots int[], p_subject text, p_faculty text, p_from text, p_why text
) returns int language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_slot int;
  v_status text;
  v_mini text[];
  v_n int := 0;
begin
  if coalesce(array_length(p_slots, 1), 0) = 0 then
    raise exception 'Pick at least one slot' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_subject, '')), '') is null or nullif(btrim(coalesce(p_from, '')), '') is null then
    raise exception 'Which class, and from where?' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.rooms where id = p_room) then
    raise exception 'Room not found' using errcode = 'P0001';
  end if;
  select array_agg(x) into v_mini
    from unnest(string_to_array(upper(regexp_replace(coalesce(p_faculty, ''), '\s', '', 'g')), ',')) x where x <> '';
  foreach v_slot in array p_slots loop
    perform public.booking_window_check(p_date, v_slot);
    select s.status into v_status from public.get_day_schedule(p_date) s where s.room_id = p_room and s.slot_id = v_slot;
    if v_status is distinct from 'free' then
      raise exception '% is no longer free at %; refresh the page for new suggestions', p_room, (select label from public.slots where id = v_slot)
        using errcode = 'P0001';
    end if;
    insert into public.allotments (room_id, date, slot_id, kind, title, faculty_email, faculty_name, faculty_initials, reason, created_by)
    values (p_room, p_date, v_slot, 'class_request', btrim(p_subject), me.email,
            case when v_mini is null then null else public.faculty_display(v_mini, null) end,
            array_to_string(v_mini, ','),
            'Moved from ' || btrim(p_from) || ' for ' || coalesce(nullif(btrim(coalesce(p_why, '')), ''), 'a booking'), me.email);
    perform public.reject_others(p_room, p_date, v_slot, null, 'Slot taken for a moved class', me.email);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.admin_move_class(text, date, int[], text, text, text, text) from public, anon;
grant execute on function public.admin_move_class(text, date, int[], text, text, text, text) to authenticated;

-- Add sections to an event or skill lab already booked: the booking's name gets the sections
-- (e.g. "Skill Lab - 3B/3D" becomes "Skill Lab - 3B/3D/3F"), so a class of those sections whose room
-- it took is no longer listed as affected, and their own classes then are released, freeing rooms.
-- p_title:     the booking's name now, as the schedule shows it
-- p_new_title: its name with the sections
-- p_releases:  [{"room": "MEL-CR-03", "slot": 3, "section": "3F"}, …], the sections' classes to release
create or replace function public.admin_add_sections(
  p_date date, p_slots int[], p_title text, p_new_title text, p_releases jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_label text := regexp_replace(btrim(coalesce(p_new_title, '')), '\s*-\s*[0-9][A-Za-z0-9/,& ]*$', '');
  v_slot int;
  v_status text;
  v_renamed int := 0;
  v_released int := 0;
  p jsonb;
  r record;
begin
  if nullif(btrim(coalesce(p_title, '')), '') is null or nullif(btrim(coalesce(p_new_title, '')), '') is null then
    raise exception 'Which event, and which sections?' using errcode = 'P0001';
  end if;
  foreach v_slot in array coalesce(p_slots, '{}') loop
    for r in select s.room_id from public.get_day_schedule(p_date) s
              where s.slot_id = v_slot and s.status in ('booked', 'event', 'cie') and s.subject = p_title loop
      perform public.booking_window_check(p_date, v_slot);
      insert into public.allotments (room_id, date, slot_id, kind, title, faculty_email, faculty_name, faculty_initials, reason, request_id, created_by)
      select a.room_id, a.date, a.slot_id, a.kind, btrim(p_new_title), a.faculty_email, a.faculty_name, a.faculty_initials, a.reason, a.request_id, me.email
        from public.allotments a where a.room_id = r.room_id and a.date = p_date and a.slot_id = v_slot
       order by a.id desc limit 1;
      v_renamed := v_renamed + 1;
    end loop;
  end loop;
  if v_renamed = 0 then
    raise exception '"%" was not found on that day; refresh the page', p_title using errcode = 'P0001';
  end if;

  for p in select * from jsonb_array_elements(coalesce(p_releases, '[]'::jsonb)) loop
    v_slot := (p ->> 'slot')::int;
    continue when public.slot_has_started(p_date, v_slot);
    select s.status into v_status from public.get_day_schedule(p_date) s where s.room_id = p ->> 'room' and s.slot_id = v_slot;
    continue when v_status is distinct from 'class';
    insert into public.allotments (room_id, date, slot_id, kind, title, faculty_name, reason, created_by)
    select s.room_id, p_date, v_slot, 'drop', coalesce(s.subject, 'Class'), s.faculty_name,
           coalesce(nullif(p ->> 'section', ''), 'Class') || ' at ' || v_label, me.email
      from public.get_day_schedule(p_date) s where s.room_id = p ->> 'room' and s.slot_id = v_slot;
    v_released := v_released + 1;
  end loop;
  return jsonb_build_object('renamed', v_renamed, 'released', v_released);
end $$;
revoke execute on function public.admin_add_sections(date, int[], text, text, jsonb) from public, anon;
grant execute on function public.admin_add_sections(date, int[], text, text, jsonb) to authenticated;

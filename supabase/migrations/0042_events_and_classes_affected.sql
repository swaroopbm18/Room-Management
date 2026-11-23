-- 0042: Bulk allotment, Classes affected and Upcoming events work as one.
-- 1. Bulk allotment books an event (or a skill lab) for some sections in one go: their own classes
--    at its times are released ("3B, 3D at Skill Lab"), so their rooms are free and those classes
--    are not listed as affected. The website works out the releases; this saves them, all or none.
-- 2. Upcoming events: an admin renames an event, CIE, SEE or skill lab (and changes its
--    description) on every one of its days at once, or cancels it. Cancelling puts each slot back
--    as it was before: the event's rooms, the classes released for it, the classes moved for it
--    and the classes cancelled for a CIE or SEE.
-- Depends on 0038. Safe to run more than once.

-- A rename keeps the name it replaced, so a later cancel can tell the event's older rows apart
-- from what the slot had before the event
alter table public.allotments add column if not exists renamed_from text;

-- "Skill Lab - 3B/3D" -> "Skill Lab": the name released and moved classes give the event. Only
-- sections are taken off ("CIE-2, 5th sem" stays as it is), as the website does.
create or replace function public.event_label(p_title text)
returns text language sql immutable as $$
  select btrim(regexp_replace(btrim(coalesce(p_title, '')), '\s*-\s*[0-9][A-Za-z]?(\s*[/,&]\s*[0-9][A-Za-z]?)*\s*$', ''))
$$;

-- Whether a change to a slot belongs to an event named p_title: its own booking, a class released
-- for it ("3B at Skill Lab"), a class moved for it ("Moved from MEL-LAB-02 for Skill Lab"), or a
-- class cancelled for it ("Cancelled for CIE: CIE-2, semester 3")
create or replace function public.part_of_event(a public.allotments, p_title text)
returns boolean language sql immutable as $$
  select coalesce(
    case
      when a.kind = 'class_request' and a.reason like 'Moved from %' then
        right(a.reason, length(' for ' || public.event_label(p_title))) = ' for ' || public.event_label(p_title)
      when a.kind in ('class_request', 'event_request', 'cie', 'event') then a.title = btrim(p_title)
      when a.kind = 'drop' and a.reason ~ '^Cancelled for (CIE|SEE): ' then
        left(substr(a.reason, 20), length(btrim(p_title) || ', semester ')) = btrim(p_title) || ', semester '
      when a.kind = 'drop' then
        right(a.reason, length(' at ' || public.event_label(p_title))) = ' at ' || public.event_label(p_title)
      else false
    end, false)
$$;

-- ---------------------------------------------------------------------------
-- 1. Bulk allot for sections
-- ---------------------------------------------------------------------------

-- p_places as for admin_bulk_allot; p_releases: [{"room": "MEL-CR-03", "date": "2026-11-24",
-- "slot": 1, "section": "3B"}, …], the classes of the sections attending to release.
create or replace function public.admin_bulk_allot_sections(
  p_places jsonb, p_kind public.allotment_kind, p_title text, p_reason text, p_faculty text, p_releases jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_label text := public.event_label(p_title);
  p jsonb;
  v_date date;
  v_slot int;
  v_status text;
  v_released int := 0;
  v_slots int;
begin
  if v_label = '' then
    raise exception 'Give the event a name' using errcode = 'P0001';
  end if;
  -- The sections' own classes first, so the rooms they free can be booked too
  for p in select * from jsonb_array_elements(coalesce(p_releases, '[]'::jsonb)) loop
    v_date := (p ->> 'date')::date;
    v_slot := (p ->> 'slot')::int;
    continue when public.slot_has_started(v_date, v_slot);
    perform public.booking_window_check(v_date, v_slot);
    select s.status into v_status from public.get_day_schedule(v_date) s where s.room_id = p ->> 'room' and s.slot_id = v_slot;
    continue when v_status is distinct from 'class';
    insert into public.allotments (room_id, date, slot_id, kind, title, faculty_name, reason, created_by)
    select s.room_id, v_date, v_slot, 'drop', coalesce(s.subject, 'Class'), s.faculty_name,
           coalesce(nullif(p ->> 'section', ''), 'Class') || ' at ' || v_label, me.email
      from public.get_day_schedule(v_date) s where s.room_id = p ->> 'room' and s.slot_id = v_slot;
    v_released := v_released + 1;
  end loop;
  v_slots := public.admin_override_many(p_places, p_kind, p_title, p_reason, p_faculty);
  return jsonb_build_object('slots', v_slots, 'released', v_released);
end $$;
revoke execute on function public.admin_bulk_allot_sections(jsonb, public.allotment_kind, text, text, text, jsonb) from public, anon;
grant execute on function public.admin_bulk_allot_sections(jsonb, public.allotment_kind, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Rename or cancel an event
-- ---------------------------------------------------------------------------

-- p_places: [{"room": "MEL-LAB-01", "date": "2026-11-24", "slots": [1, 2]}, …], every slot of
-- the event and of the classes released, moved or cancelled for it. A slot whose latest change
-- is not part of the event (it has been changed since) is left alone, as is a slot that has started.
-- p_cancel false: rename. The event's bookings get p_new_title and p_reason; the released and
-- moved classes name the new name.
-- p_cancel true: each slot goes back to its last change from before the event, or to the timetable.
create or replace function public.admin_change_event(
  p_places jsonb, p_title text, p_new_title text, p_reason text, p_cancel boolean
) returns int language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_title text := btrim(coalesce(p_title, ''));
  v_new_title text := btrim(coalesce(p_new_title, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_old text := public.event_label(p_title);
  v_new text := public.event_label(p_new_title);
  p jsonb;
  v_room text;
  v_date date;
  v_slot int;
  cur public.allotments;
  prev public.allotments;
  r public.allotments;
  v_titles text[];
  v_text text;
  v_n int := 0;
begin
  if v_title = '' then
    raise exception 'Which event?' using errcode = 'P0001';
  end if;
  if not p_cancel then
    if v_new_title = '' or length(v_new_title) > 80 then
      raise exception 'The name must be 1 to 80 characters' using errcode = 'P0001';
    end if;
    if length(v_reason) < 5 or length(v_reason) > 500 then
      raise exception 'The description must be 5 to 500 characters' using errcode = 'P0001';
    end if;
  end if;
  if jsonb_typeof(p_places) <> 'array' then
    raise exception 'Which days and rooms?' using errcode = 'P0001';
  end if;

  for p in select * from jsonb_array_elements(p_places) loop
    v_room := p ->> 'room';
    v_date := (p ->> 'date')::date;
    for v_slot in select x::int from jsonb_array_elements_text(p -> 'slots') x loop
      continue when public.slot_has_started(v_date, v_slot);
      cur := null;
      select * into cur from public.allotments a
       where a.room_id = v_room and a.date = v_date and a.slot_id = v_slot
       order by a.id desc limit 1;
      continue when cur.id is null or not public.part_of_event(cur, v_title);

      if p_cancel then
        -- Back past every row of the event, under any name it has had, to what was there before
        prev := null;
        v_titles := array[v_title];
        for r in select * from public.allotments a
                  where a.room_id = v_room and a.date = v_date and a.slot_id = v_slot and a.id <= cur.id
                  order by a.id desc loop
          if exists (select 1 from unnest(v_titles) t where public.part_of_event(r, t)) then
            if r.renamed_from is not null and not r.renamed_from = any (v_titles) then
              v_titles := v_titles || r.renamed_from;
            end if;
            continue;
          end if;
          prev := r;
          exit;
        end loop;
        if prev.id is null or prev.kind = 'restore' then
          insert into public.allotments (room_id, date, slot_id, kind, reason, faculty_email, faculty_name, created_by)
          values (v_room, v_date, v_slot, 'restore', 'Cancelled: ' || v_title, me.email, public.display_name(me), me.email);
        else
          insert into public.allotments (room_id, date, slot_id, kind, title, faculty_email, faculty_name, faculty_initials, reason, request_id, created_by)
          values (v_room, v_date, v_slot, prev.kind, prev.title, prev.faculty_email, prev.faculty_name, prev.faculty_initials, prev.reason, prev.request_id, me.email);
        end if;
      else
        v_text := case
          when cur.kind = 'class_request' and cur.reason like 'Moved from %' then
            left(cur.reason, length(cur.reason) - length(v_old)) || v_new
          when cur.kind in ('class_request', 'event_request', 'cie', 'event') then v_reason
          when cur.reason ~ '^Cancelled for (CIE|SEE): ' then
            left(cur.reason, 19) || v_new_title || substr(cur.reason, 20 + length(v_title))
          else left(cur.reason, length(cur.reason) - length(v_old)) || v_new
        end;
        insert into public.allotments (room_id, date, slot_id, kind, title, faculty_email, faculty_name, faculty_initials, reason, request_id, created_by, renamed_from)
        values (v_room, v_date, v_slot, cur.kind,
                case when cur.kind in ('class_request', 'event_request', 'cie', 'event') and cur.title = v_title then v_new_title else cur.title end,
                cur.faculty_email, cur.faculty_name, cur.faculty_initials, v_text, cur.request_id, me.email,
                case when v_new_title <> v_title then v_title end);
      end if;
      v_n := v_n + 1;
    end loop;
  end loop;
  if v_n = 0 then
    raise exception 'Nothing of "%" is left to change; refresh the page', v_title using errcode = 'P0001';
  end if;
  return v_n;
end $$;
revoke execute on function public.admin_change_event(jsonb, text, text, text, boolean) from public, anon;
grant execute on function public.admin_change_event(jsonb, text, text, text, boolean) to authenticated;

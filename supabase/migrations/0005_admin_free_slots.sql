-- Admins can free a room: remove a regular class, an approved request or an admin booking
-- from one or more future slots. Like every change, this is a new row in the allotment log,
-- so nothing in the past is altered and an admin can restore the slot later.
create or replace function public.admin_free_slots(p_room text, p_date date, p_slots int[], p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_slot int;
  d record;
  v_freed int := 0;
begin
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Please add a reason' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_slots, 1), 0) = 0 then
    raise exception 'Pick at least one slot' using errcode = 'P0001';
  end if;
  foreach v_slot in array p_slots loop
    if public.slot_has_ended(p_date, v_slot) then
      raise exception 'Past slots cannot be changed' using errcode = 'P0001';
    end if;
    select * into d from public.get_day_schedule(p_date) s where s.room_id = p_room and s.slot_id = v_slot;
    if d.status is null then
      raise exception 'Unknown room or slot' using errcode = 'P0001';
    end if;
    continue when d.status = 'free';
    insert into public.allotments (room_id, date, slot_id, kind, title, faculty_name, reason, created_by)
    values (p_room, p_date, v_slot, 'drop', coalesce(d.subject, 'Class'), d.faculty_name,
            'Removed by admin: ' || btrim(p_reason), me.email);
    v_freed := v_freed + 1;
  end loop;
  if v_freed = 0 then
    raise exception 'Those slots are already free' using errcode = 'P0001';
  end if;
  return v_freed;
end $$;

revoke execute on function public.admin_free_slots(text, date, int[], text) from public, anon;
grant execute on function public.admin_free_slots(text, date, int[], text) to authenticated;

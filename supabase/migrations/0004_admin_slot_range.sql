-- Admins can allot a room for a CIE or event across several slots at once (start to end time).
-- All slots are allotted together, or none are if any slot fails.
create or replace function public.admin_override_slots(
  p_room text, p_date date, p_slots int[], p_kind public.allotment_kind, p_title text, p_reason text
) returns void language plpgsql security definer set search_path = public as $$
declare v_slot int;
begin
  perform public.require_admin();
  if coalesce(array_length(p_slots, 1), 0) = 0 then
    raise exception 'Pick at least one slot' using errcode = 'P0001';
  end if;
  foreach v_slot in array p_slots loop
    perform public.admin_override(p_room, p_date, v_slot, p_kind, p_title, p_reason);
  end loop;
end $$;

revoke execute on function public.admin_override_slots(text, date, int[], public.allotment_kind, text, text) from public, anon;
grant execute on function public.admin_override_slots(text, date, int[], public.allotment_kind, text, text) to authenticated;

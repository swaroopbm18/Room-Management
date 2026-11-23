-- 0043: Remove the Equipment & supplies feature's data for good.
-- The pages were removed from the website (PR #59). This drops what was left in the database:
-- the equipment list and its bookings, the supplies stock and the resource requests, with the
-- functions that changed them. Past activity-log entries about them stay.
--
-- THIS CANNOT BE UNDONE. Before running it, download a backup (Admin → Timetables → Semester →
-- Start a new semester → Download backup) if you might want those records. Backups made after
-- this no longer have the Equipment bookings sheet.

drop function if exists public.admin_save_equipment(int, text, text, boolean);
drop function if exists public.book_equipment(int, date, int[], text, text);
drop function if exists public.cancel_equipment(bigint);
drop function if exists public.edit_equipment_booking(bigint, text, text);
drop function if exists public.admin_delete_equipment(int);
drop function if exists public.admin_save_supply(int, text, text, int, boolean);
drop function if exists public.request_resource(int, text, int, date, text, text);
drop function if exists public.cancel_resource_request(bigint);
drop function if exists public.admin_decide_resource(bigint, boolean, text);

drop table if exists public.equipment_bookings;
drop table if exists public.equipment;
drop table if exists public.resource_requests;
drop table if exists public.supplies;

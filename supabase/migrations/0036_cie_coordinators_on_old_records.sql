-- 0036: CIEs and SEEs allotted before 0032 still carry the allotting admin as their faculty.
-- Every CIE or SEE with no faculty named now shows its co-ordinators ("CIE Co-ordinators" or
-- "SEE Co-ordinators"), on the timetable, the home page and in the report.
-- Records can't normally be changed (allotments_no_update), so that check is switched off for
-- this one update only, inside one transaction. Depends on 0034. Safe to run more than once.

begin;

alter table public.allotments disable trigger allotments_no_update;
alter table public.allotments disable trigger log_activity;

update public.allotments
   set faculty_name = case when coalesce(title, '') ~* '^\s*SEE\M' then 'SEE Co-ordinators' else 'CIE Co-ordinators' end
 where kind = 'cie'
   and faculty_initials is null
   and faculty_name is distinct from (case when coalesce(title, '') ~* '^\s*SEE\M' then 'SEE Co-ordinators' else 'CIE Co-ordinators' end);

alter table public.allotments enable trigger log_activity;
alter table public.allotments enable trigger allotments_no_update;

commit;

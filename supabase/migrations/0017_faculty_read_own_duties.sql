-- Faculty see their own week on My dashboard, including the duties admins added for them
-- (proctoring, committees and so on). Admins still read everyone's. Depends on 0013.

create policy "faculty read own duties" on public.faculty_duties for select
  using (initials = (select p.initials from public.people p where p.email = public.current_email() and p.active));

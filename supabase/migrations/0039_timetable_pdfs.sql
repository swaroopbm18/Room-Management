-- 0039: Timetable PDFs.
-- An admin uploads the official timetable PDF for each semester or section (e.g. 3, 3A), one
-- PDF of every class's timetable ("ALL") and one of every faculty member's timetable
-- ("FACULTY"). Everyone can open them from the class timetable and faculty pages. The PDFs are
-- kept as they are: the timetable office's PDFs are scans, so the room timetable itself still
-- comes from the Word upload.
-- A new upload for the same semester or section replaces the old one.
-- Safe to run more than once.

-- Public bucket: the PDFs are the same timetables the class timetable page already shows
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('timetables', 'timetables', true, 20971520, array['application/pdf'])
on conflict (id) do update set public = true, file_size_limit = 20971520, allowed_mime_types = array['application/pdf'];

drop policy if exists "admins upload timetable pdfs" on storage.objects;
create policy "admins upload timetable pdfs" on storage.objects for insert to authenticated
  with check (bucket_id = 'timetables' and public.is_admin());

drop policy if exists "admins read timetable pdfs" on storage.objects;
create policy "admins read timetable pdfs" on storage.objects for select to authenticated
  using (bucket_id = 'timetables' and public.is_admin());

drop policy if exists "admins delete timetable pdfs" on storage.objects;
create policy "admins delete timetable pdfs" on storage.objects for delete to authenticated
  using (bucket_id = 'timetables' and public.is_admin());

-- One PDF per semester ("3"), section ("3A"), all classes ("ALL") or all faculty ("FACULTY")
create table if not exists public.timetable_pdfs (
  key text primary key check (key ~ '^([1-8][A-Z]?|ALL|FACULTY)$'),
  path text not null,
  file_name text not null default '',
  size_bytes bigint not null default 0,
  uploaded_by text not null default '',
  uploaded_at timestamptz not null default now()
);
alter table public.timetable_pdfs enable row level security;
drop policy if exists "everyone reads timetable pdfs" on public.timetable_pdfs;
create policy "everyone reads timetable pdfs" on public.timetable_pdfs for select using (true);
grant select on public.timetable_pdfs to anon, authenticated;

-- Save an uploaded PDF for a semester or section. Returns the replaced file's path (or null),
-- so the website can remove it from storage.
create or replace function public.admin_save_timetable_pdf(p_key text, p_path text, p_file_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_key text := upper(btrim(coalesce(p_key, '')));
  v_size bigint;
  v_old text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can upload timetables' using errcode = '42501';
  end if;
  if v_key !~ '^([1-8][A-Z]?|ALL|FACULTY)$' then
    raise exception 'Pick the semester or section this timetable is for' using errcode = 'P0001';
  end if;
  select (o.metadata ->> 'size')::bigint into v_size
    from storage.objects o where o.bucket_id = 'timetables' and o.name = p_path;
  if v_size is null then
    raise exception 'The PDF was not uploaded. Please try again.' using errcode = 'P0001';
  end if;

  select path into v_old from public.timetable_pdfs where key = v_key;
  insert into public.timetable_pdfs (key, path, file_name, size_bytes, uploaded_by, uploaded_at)
  values (v_key, p_path, left(btrim(coalesce(p_file_name, '')), 200), v_size, coalesce(public.current_email(), ''), now())
  on conflict (key) do update
    set path = excluded.path, file_name = excluded.file_name, size_bytes = excluded.size_bytes,
        uploaded_by = excluded.uploaded_by, uploaded_at = excluded.uploaded_at;
  return nullif(v_old, p_path);
end $$;
grant execute on function public.admin_save_timetable_pdf(text, text, text) to authenticated;

-- Remove a semester's or section's PDF. Returns its path, so the website can remove the file.
create or replace function public.admin_delete_timetable_pdf(p_key text)
returns text language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can remove timetables' using errcode = '42501';
  end if;
  delete from public.timetable_pdfs where key = upper(btrim(coalesce(p_key, ''))) returning path into v_old;
  return v_old;
end $$;
grant execute on function public.admin_delete_timetable_pdf(text) to authenticated;

-- In the activity log like everything else admins change
drop trigger if exists log_activity on public.timetable_pdfs;
create trigger log_activity after insert or update or delete on public.timetable_pdfs
  for each row execute function public.log_activity();

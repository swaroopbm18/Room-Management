-- Subjects for class requests.
-- 1. Admins allot subjects (with the section, as written in the timetable, e.g. 'DBMS-3B') to
--    each faculty member, by hand or by pulling them from the current timetable, which is the
--    one uploaded from the Word file. Faculty are matched to the timetable by their initials.
-- 2. A class request now names one of the requester's allotted subjects. The subject is
--    stored on the request and shown as the allotment's title once approved, so removing a
--    subject later never changes a past request or allotment.

create table public.faculty_subjects (
  email      text not null references public.people(email),
  subject    text not null check (length(btrim(subject)) > 0 and length(subject) <= 40),
  source     text not null default 'admin' check (source in ('admin', 'timetable')),
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (email, subject)
);
alter table public.faculty_subjects enable row level security;
create policy "staff read own subjects, admins read all" on public.faculty_subjects for select
  using (email = public.current_email() or public.is_admin());
grant select on public.faculty_subjects to authenticated;

create or replace function public.admin_add_subject(p_email text, p_subject text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_subject text := upper(regexp_replace(btrim(coalesce(p_subject, '')), '\s+', ' ', 'g'));
begin
  if v_subject = '' then
    raise exception 'Enter a subject, e.g. DBMS-3B' using errcode = 'P0001';
  end if;
  if length(v_subject) > 40 then
    raise exception 'A subject can be at most 40 characters' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.people where email = lower(btrim(p_email))) then
    raise exception 'That person is not on the faculty list' using errcode = 'P0001';
  end if;
  insert into public.faculty_subjects (email, subject, source, created_by)
  values (lower(btrim(p_email)), v_subject, 'admin', me.email)
  on conflict (email, subject) do nothing;
  if not found then
    raise exception '% already has %', lower(btrim(p_email)), v_subject using errcode = 'P0001';
  end if;
end $$;

create or replace function public.admin_remove_subject(p_email text, p_subject text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  delete from public.faculty_subjects where email = p_email and subject = p_subject;
end $$;

-- Every (initials, subject) pair in the current timetable: today's version and any version
-- starting later, so a Word upload that takes effect tomorrow is included.
create or replace function public.timetable_subjects()
returns table (initials text, subject text)
language sql stable security definer set search_path = public as $$
  select distinct i.ini, upper(btrim(t.subject))
    from public.timetable_entries t
    join public.timetable_versions v on v.id = t.version_id and v.valid_to >= public.ist_today()
    cross join lateral unnest(t.faculty_initials) as i(ini)
   where not t.is_department and btrim(t.subject) <> '' and length(btrim(t.subject)) <= 40
$$;
grant execute on function public.timetable_subjects() to authenticated;

-- Allot every subject the current timetable gives a faculty member through their initials.
-- Existing subjects are kept. Returns how many were added.
create or replace function public.admin_subjects_from_timetable() returns int
language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_added int;
begin
  insert into public.faculty_subjects (email, subject, source, created_by)
  select distinct p.email, ts.subject, 'timetable', me.email
    from public.timetable_subjects() ts
    join public.people p on p.initials = ts.initials
  on conflict (email, subject) do nothing;
  get diagnostics v_added = row_count;
  return v_added;
end $$;

revoke execute on function public.admin_add_subject(text, text) from public, anon;
grant execute on function public.admin_add_subject(text, text) to authenticated;
revoke execute on function public.admin_remove_subject(text, text) from public, anon;
grant execute on function public.admin_remove_subject(text, text) to authenticated;
revoke execute on function public.admin_subjects_from_timetable() from public, anon;
grant execute on function public.admin_subjects_from_timetable() to authenticated;

-- ---------------------------------------------------------------------------
-- Requests carry the subject
-- ---------------------------------------------------------------------------

alter table public.requests add column subject text;

-- The subject joins the columns that can never change.
create or replace function public.requests_guard_update() returns trigger
language plpgsql as $$
begin
  if public.slot_has_ended(old.date, old.slot_id) then
    raise exception 'This slot has already ended; past requests cannot be changed'
      using errcode = 'P0001';
  end if;
  if (new.room_id, new.date, new.slot_id, new.requester_email, new.requester_name,
      new.type, new.description, new.pdf_path, new.created_at, new.id, new.group_id, new.subject)
     is distinct from
     (old.room_id, old.date, old.slot_id, old.requester_email, old.requester_name,
      old.type, old.description, old.pdf_path, old.created_at, old.id, old.group_id, old.subject) then
    raise exception 'Only the status and priority of a request can change'
      using errcode = 'P0001';
  end if;
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'This request has already been decided' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- The old six-argument version is replaced by one that also takes the subject. Dropping it
-- only removes the function definition; no request or allotment is touched.
drop function if exists public.create_group_request(text, date, int[], public.request_type, text, text);

create or replace function public.create_group_request(
  p_room text, p_date date, p_slots int[],
  p_type public.request_type, p_description text, p_pdf_path text default null,
  p_subject text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me public.people;
  v_size bigint;
  v_group uuid := gen_random_uuid();
  v_slot int;
  v_n int;
  v_span int;
  v_priority int;
begin
  me := public.current_person();
  if me.email is null then
    raise exception 'Only registered faculty can request rooms' using errcode = '42501';
  end if;
  v_n := coalesce(array_length(p_slots, 1), 0);
  if v_n = 0 then
    raise exception 'Pick at least one slot' using errcode = 'P0001';
  end if;
  -- Slots must be distinct and next to each other in the day's order (breaks don't count as gaps).
  select count(distinct s.id), max(s.pos) - min(s.pos) + 1 into v_n, v_span
    from (select id, row_number() over (order by starts) as pos from public.slots) s
   where s.id = any (p_slots);
  if v_n <> array_length(p_slots, 1) or v_span <> v_n then
    raise exception 'The slots in one request must be consecutive' using errcode = 'P0001';
  end if;
  foreach v_slot in array p_slots loop
    perform public.booking_window_check(p_date, v_slot);
    if (select status from public.slot_state(p_room, p_date, v_slot)) is distinct from 'free' then
      raise exception 'Only free slots can be requested' using errcode = 'P0001';
    end if;
  end loop;
  if exists (select 1 from public.requests
              where room_id = p_room and date = p_date and slot_id = any (p_slots)
                and requester_email = me.email and status = 'pending') then
    raise exception 'You already have a pending request for one of these slots' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_description, ''))) < 5 then
    raise exception 'Please add a description' using errcode = 'P0001';
  end if;
  if p_type = 'class' then
    if not exists (select 1 from public.faculty_subjects where email = me.email) then
      raise exception 'No subjects are allotted to you yet. Ask an admin to add your subjects.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.faculty_subjects where email = me.email and subject = p_subject) then
      raise exception 'Pick one of your subjects for the class' using errcode = 'P0001';
    end if;
  else
    p_subject := null;
  end if;
  if p_type = 'event' then
    if p_pdf_path is null or split_part(p_pdf_path, '/', 1) <> me.email then
      raise exception 'An event request needs the approval letter as a PDF' using errcode = 'P0001';
    end if;
    select (o.metadata ->> 'size')::bigint into v_size
      from storage.objects o where o.bucket_id = 'letters' and o.name = p_pdf_path;
    if v_size is null then
      raise exception 'The approval letter was not uploaded' using errcode = 'P0001';
    end if;
    if v_size > 5 * 1024 * 1024 then
      raise exception 'The approval letter must be under 5 MB' using errcode = 'P0001';
    end if;
  else
    p_pdf_path := null;
  end if;

  select coalesce(max(priority) + 1, 0) into v_priority
    from public.requests where room_id = p_room and date = p_date and status = 'pending';

  insert into public.requests (room_id, date, slot_id, requester_email, requester_name,
                               type, description, pdf_path, priority, group_id, subject)
  select p_room, p_date, s, me.email, public.display_name(me), p_type, btrim(p_description),
         p_pdf_path, v_priority, v_group, p_subject
    from unnest(p_slots) as s;
  return v_group;
end $$;

revoke execute on function public.create_group_request(text, date, int[], public.request_type, text, text, text) from public, anon;
grant execute on function public.create_group_request(text, date, int[], public.request_type, text, text, text) to authenticated;

-- An approved class shows its subject in the timetable instead of just "Class".
create or replace function public.approve_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.people := public.require_admin();
  v_group uuid;
  r public.requests;
begin
  select group_id into v_group from public.requests where id = p_id or group_id = p_id limit 1;
  if v_group is null then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;
  perform 1 from public.requests where group_id = v_group for update;
  if exists (select 1 from public.requests where group_id = v_group and status <> 'pending') then
    raise exception 'This request has already been decided' using errcode = 'P0001';
  end if;
  for r in select * from public.requests where group_id = v_group order by slot_id loop
    if (select status from public.slot_state(r.room_id, r.date, r.slot_id)) is distinct from 'free' then
      raise exception 'Slot % is no longer free', (select label from public.slots where id = r.slot_id)
        using errcode = 'P0001';
    end if;
  end loop;
  update public.requests set status = 'approved', decided_by = me.email, decided_at = now()
   where group_id = v_group;
  for r in select * from public.requests where group_id = v_group order by slot_id loop
    insert into public.allotments (room_id, date, slot_id, kind, title, faculty_email, faculty_name,
                                   reason, request_id, created_by)
    values (r.room_id, r.date, r.slot_id,
            case r.type when 'class' then 'class_request' else 'event_request' end::public.allotment_kind,
            case r.type when 'class' then coalesce(r.subject, 'Class') else 'Event' end,
            r.requester_email, r.requester_name, r.description, r.id, me.email);
    perform public.reject_others(r.room_id, r.date, r.slot_id, v_group,
                                 'Another request was approved for this slot', me.email);
  end loop;
end $$;

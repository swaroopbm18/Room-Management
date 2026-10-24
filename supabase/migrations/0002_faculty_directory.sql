-- Full names for the initials used in the timetable, taken from the "Faculty In-charge"
-- tables of the class timetables (CLASS_TT_13_10_2026.pdf). Used for display until a
-- person is added to public.people with the same initials, whose name then takes over.

create table public.faculty_directory (
  initials  text primary key,
  title     text not null default '',
  full_name text not null
);
alter table public.faculty_directory enable row level security;
create policy "anyone reads faculty names" on public.faculty_directory for select using (true);
grant select on public.faculty_directory to anon, authenticated;

insert into public.faculty_directory (initials, title, full_name) values
  ('ACM', 'Dr.', 'Anthony Christy Melson'),
  ('AG', 'Prof.', 'Asha G'),
  ('AKN', 'Dr.', 'Ashok Kumar N'),
  ('AMK', 'Prof.', 'Amaresha K'),
  ('APR', 'Dr.', 'Ambika PR'),
  ('AS', 'Prof.', 'Amitha S'),
  ('BHL', 'Prof.', 'Bhavyashree H L'),
  ('BM', 'Dr.', 'Bandaru Mallikarjuna'),
  ('CG', 'Dr.', 'Chandrashekara G'),
  ('CS', 'Prof.', 'Suprity Chakraborty'),
  ('CV', 'Dr.', 'Chethana V'),
  ('GDS', 'Dr.', 'Girish D.S.'),
  ('GRP', 'Dr.', 'Prasad G.R.'),
  ('GSS', 'Prof.', 'Spoorthi G.S.'),
  ('HC', 'Dr.', 'Hemanth Kumar C'),
  ('JS', 'Dr.', 'Jahnavi S'),
  ('KS', 'Prof.', 'Kavyashree'),
  ('LBK', 'Prof.', 'Lavanya B Koppal'),
  ('LMR', 'Prof.', 'Latha MR'),
  ('MD', 'Dr.', 'Dakshayini M'),
  ('MK', 'Prof.', 'Maithri K'),
  ('MP', 'Dr.', 'Monika P'),
  ('MS', 'Dr.', 'M Shekar'),
  ('NCR', 'Dr.', 'Nagrathna C R'),
  ('NM', 'Prof.', 'Nida Mohammadi'),
  ('NNK', 'Prof.', 'Nayana NK'),
  ('PB', 'Prof.', 'Pallavi B'),
  ('PN', 'Prof.', 'Priyanka N'),
  ('PR', 'Prof.', 'Puneeth R'),
  ('RH', 'Prof.', 'Ranjini H'),
  ('RK', 'Prof.', 'Renuka Devi K'),
  ('RMR', 'Dr.', 'Rajeshwari M R'),
  ('RN', 'Prof.', 'Rutuparna N'),
  ('RV', 'Prof.', 'Vaishnavi R'),
  ('SA', 'Prof.', 'Spoorti Admani'),
  ('SBM', 'Prof.', 'Swaroop B.M.'),
  ('SD', 'Prof.', 'Shridevi A Desai'),
  ('SKS', 'Prof.', 'Shailashree K Sheshadri'),
  ('SMU', 'Prof.', 'Syeeda Mujeebunnisa'),
  ('SP', 'Prof.', 'Supriya P'),
  ('SR', 'Prof.', 'Sudhindra R'),
  ('SS', 'Prof.', 'Sunil Sungas'),
  ('SSB', 'Prof.', 'Swapna Subhash Banasode'),
  ('SSK', 'Dr.', 'Sanket S Kulkarni'),
  ('STN', 'Prof.', 'Suma T N'),
  ('SVN', 'Dr.', 'Sandeep Varma N'),
  ('UP', 'Prof.', 'Upeksha Prasad G'),
  ('VBG', 'Dr.', 'Vishruth BG'),
  ('VH', 'Dr.', 'Vinutha H'),
  ('VMJ', 'Prof.', 'Vamshi M Jois'),
  ('VR', 'Prof.', 'Varsha R'),
  ('VS', 'Prof.', 'Vishwas S'),
  ('YBM', 'Prof.', 'Yashaswini B M'),
  ('YR', 'Prof.', 'Yashaswi R')
on conflict (initials) do update set title = excluded.title, full_name = excluded.full_name;

create or replace function public.faculty_display(p_initials text[], p_label text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when coalesce(array_length(p_initials, 1), 0) = 0 then nullif(p_label, '')
    else (
      select string_agg(
               coalesce(public.display_name(p),
                        nullif(btrim(d.title || ' ' || d.full_name), ''),
                        nullif(split_part(p_label, ', ', i.ord::int), ''),
                        i.ini),
               ', ' order by i.ord)
      from unnest(p_initials) with ordinality as i(ini, ord)
      left join public.people p on p.initials = i.ini and p.active
      left join public.faculty_directory d on d.initials = i.ini
    )
  end
$$;

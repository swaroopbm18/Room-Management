# BMSCE Room Management

Classroom allotment for the Department of Machine Learning, BMSCE. Students see which room is used by whom in every slot; faculty request free rooms or drop a class; the HOD and Time Table Officers approve requests and take rooms for CIE and college events.

**Stack:** Next.js 15 (App Router) + Tailwind CSS 4 on Vercel, Supabase (Postgres, Google sign-in, file storage). All on free tiers.

## What each role can do

| Role | Signs in? | Can |
| --- | --- | --- |
| Student | No | See every room's subject and faculty for any slot, and the free slots |
| Faculty | Google, @bmsce.ac.in, must be on the list | Request a **free** slot (class, or event with a PDF approval letter under 5 MB), see their requests, withdraw a pending one, drop one occurrence of their own class |
| Admin (HOD, Time Table Officers) | Same | Everything faculty can, plus approve or reject requests in priority order, allot any room for a CIE or event, restore a slot to the timetable, manage the faculty/admin list, view the full history |

## How the data works

- `timetable_entries` holds the weekly timetable imported from the department's Word file. A revised timetable is a **new version** starting today or later, so past days always show the timetable that applied then.
- `allotments` is an append-only log of every change to a (room, date, slot): approved requests, CIE/event overrides, dropped classes and restores. The latest row wins.
- `requests` holds faculty requests. Several requests per slot are allowed; approving one declines the rest.
- **Past data is locked in the database itself.** Triggers reject any update or delete on `allotments` and the timetable, any change to a request once its slot has ended, and any new allotment for a slot that has ended. This applies to every account, admins included.
- Users never write to tables directly. Every action goes through a Postgres function that checks the caller's role (see `supabase/migrations/0001_init.sql`). Row-level security hides requests from other faculty and keeps approval letters private.
- All times are IST. Slots: 8:00, 8:55, 10:20, 11:15, 12:10, 1:05, 2:00, 2:55, 3:50 and 4:45 (55 minutes each), Monday to Saturday. Bookings open up to 4 weeks ahead.

## Deploying (about 30 minutes, once)

### 1. Supabase (database and login)

1. Sign up at [supabase.com](https://supabase.com) with GitHub and create a project. Pick the **Mumbai (ap-south-1)** region and save the database password somewhere safe.
2. Open **SQL Editor** and run these files one after another, pasting the whole of each: `supabase/migrations/0001_init.sql`, `supabase/migrations/0002_faculty_directory.sql` (full names for the timetable initials), `supabase/migrations/0003_multi_slot_requests.sql` (requests covering several slots in a row), `supabase/migrations/0004_admin_slot_range.sql` (admins allot a start-to-end range), then `supabase/seed.sql` (rooms, slots and the timetable).
3. Still in the SQL Editor, add yourself as the first admin (use your real email and name):
   ```sql
   insert into public.people (email, full_name, title, role)
   values ('your.name@bmsce.ac.in', 'Your Name', 'Prof.', 'admin');
   ```
   Everyone else can be added later from the website (**Admin → Faculty & admins**, including a bulk import that accepts `faculty-list.csv` rows).
4. Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key.

### 2. Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com), create a project, then open **APIs & Services → OAuth consent screen**. Choose **External**, fill in the app name and your email, and click **Publish app** (basic sign-in needs no Google review).
2. **Credentials → Create credentials → OAuth client ID → Web application.** Under *Authorized redirect URIs* add `https://<your-project-ref>.supabase.co/auth/v1/callback`.
3. In Supabase, open **Authentication → Sign In / Providers → Google**, turn it on, and paste the client ID and secret.

### 3. Vercel (website hosting)

1. Sign up at [vercel.com](https://vercel.com) with GitHub, click **Add New → Project**, and import this repository.
2. Add the two environment variables from `.env.example` with the values from step 1.4, then **Deploy**.
   Optional, for a cleaner Google sign-in screen: also add `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (your Google web client's Client ID), and in Google Cloud add your Vercel address under the client's **Authorized JavaScript origins**. Without it, sign-in still works but Google shows the Supabase address.
3. Back in Supabase, open **Authentication → URL Configuration**. Set **Site URL** to your Vercel address (e.g. `https://room-management.vercel.app`) and add `https://room-management.vercel.app/**` under **Redirect URLs**.

### 4. Optional: keep Supabase awake in holidays

Supabase pauses free projects after 7 days with no visits. In GitHub, open **Settings → Secrets and variables → Actions** and add `SUPABASE_URL` and `SUPABASE_ANON_KEY`; the included workflow then pings the database every 3 days.

## Updating the timetable

When the department issues a revised timetable, generate it as the next version, starting today or later:

```bash
pip install python-docx
python3 scripts/parse_timetable.py "Revised Timetable.docx" --version 2 --from 2026-11-02 > revision.sql
```

Run `revision.sql` in the Supabase SQL Editor. From that date on the new timetable applies; past days keep the old one, and the database refuses a revision that starts in the past.

## Local development

```bash
cp .env.example .env.local   # fill in your Supabase values
npm install
npm run dev
```

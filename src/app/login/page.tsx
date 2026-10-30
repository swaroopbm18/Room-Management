import { redirect } from "next/navigation";
import Flash from "@/components/Flash";
import { IconCalendarCheck, IconHistory, IconLock, IconShield } from "@/components/Icons";
import { getPerson } from "@/lib/auth";
import GoogleButton from "./GoogleButton";

export const dynamic = "force-dynamic";

export const metadata = { title: "Faculty and admin login", robots: { index: false } };

const ERRORS: Record<string, string> = {
  domain: "Please sign in with your @bmsce.ac.in college account.",
  not_registered: "Your email is not on the faculty or admin list yet. Please ask the HOD or a Time Table Officer to add you.",
  auth: "Sign-in failed. Please try again.",
};

const FEATURES = [
  { icon: IconCalendarCheck, title: "Conflict-free allotment", text: "Every request is checked against the timetable and other bookings before it is approved." },
  { icon: IconHistory, title: "Permanent records", text: "Past allotments are kept as the department's record and can't be changed by anyone." },
  { icon: IconShield, title: "Role-based access", text: "The HOD and Time Table Officers approve, faculty request rooms, and students can view." },
];

export default async function Login({ searchParams }: { searchParams: Promise<{ as?: string; error?: string }> }) {
  const sp = await searchParams;
  const as = sp.as === "admin" ? "admin" : "faculty";
  const person = await getPerson();
  if (person) redirect(as === "admin" && person.role === "admin" ? "/admin" : "/faculty");

  return (
    <div className="grid overflow-hidden rounded-2xl shadow-xl ring-1 ring-brand-900/40 lg:min-h-[640px] lg:grid-cols-[1.15fr_1fr]">
      {/* Left: what the site is for, on a dark navy grid */}
      <section className="relative isolate flex flex-col justify-between gap-10 bg-gradient-to-br from-brand-950 via-brand-950 to-ink p-8 text-white sm:p-10 lg:p-12">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage: "linear-gradient(rgba(147,197,253,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(147,197,253,0.06) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <IconCalendarCheck className="h-6 w-6 text-brand-200" />
          </span>
          <div className="leading-tight">
            <div className="font-semibold">BMSCE Room Management</div>
            <div className="text-[11px] tracking-[0.18em] text-brand-200/80 uppercase">Department of Machine Learning</div>
          </div>
        </div>

        <div className="max-w-xl">
          <div className="text-xs font-semibold tracking-[0.25em] text-brand-300 uppercase">B.M.S. College of Engineering</div>
          <h1 className="mt-4 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl xl:text-[2.75rem]">
            Every classroom, every slot, with clarity and control.
          </h1>
          <p className="mt-4 text-brand-100/80">
            One place for the department&apos;s room allotments: the regular timetable, room requests, CIEs and college events, and reports.
          </p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/10 text-brand-300">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="block text-sm text-brand-100/70">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap justify-between gap-2 text-xs text-brand-100/50">
          <span>Classroom allotment · Dept. of Machine Learning</span>
          <span>Secure access · @bmsce.ac.in only</span>
        </div>
      </section>

      {/* Right: the sign-in card */}
      <section className="flex items-center justify-center bg-brand-50 p-6 sm:p-10 dark:bg-[#070b16]">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg ring-1 ring-brand-100 dark:bg-ink dark:ring-brand-900">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-800 ring-1 ring-brand-100 dark:bg-brand-950 dark:text-brand-200 dark:ring-brand-900">
            <IconLock className="h-6 w-6" />
          </span>
          <div className="mt-5 text-xs font-semibold tracking-wider text-brand-600 uppercase dark:text-brand-400">
            {as === "admin" ? "Admin login" : "Faculty login"}
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="muted mt-2 text-sm">
            {as === "admin"
              ? "Sign in with your college Google account to approve requests and allot rooms for CIEs and college events."
              : "Sign in with your college Google account to request free classrooms or drop a class you can't take."}
          </p>
          <div className="mt-6">
            <Flash error={sp.error ? (ERRORS[sp.error] ?? sp.error) : undefined} />
            <GoogleButton next={as === "admin" ? "/admin" : "/faculty"} />
          </div>
          <p className="mt-6 flex gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
            <IconShield className="h-4 w-4 shrink-0" />
            Only @bmsce.ac.in accounts on the department list can sign in. Ask the HOD or a Time Table Officer if you need access.
          </p>
          <p className="muted mt-6 text-center text-xs">Students don&apos;t need to sign in. The home page shows every room&apos;s allotment.</p>
        </div>
      </section>
    </div>
  );
}

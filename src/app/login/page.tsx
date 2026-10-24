import { redirect } from "next/navigation";
import Flash from "@/components/Flash";
import { IconShield, IconUser } from "@/components/Icons";
import { getPerson } from "@/lib/auth";
import GoogleButton from "./GoogleButton";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  domain: "Please sign in with your @bmsce.ac.in college account.",
  not_registered: "Your email is not on the faculty or admin list yet. Please ask the HOD or a Time Table Officer to add you.",
  auth: "Sign-in failed. Please try again.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ as?: string; error?: string }> }) {
  const sp = await searchParams;
  const as = sp.as === "admin" ? "admin" : "faculty";
  const person = await getPerson();
  if (person) redirect(as === "admin" && person.role === "admin" ? "/admin" : "/faculty");

  return (
    <div className="mx-auto max-w-md">
      <Flash error={sp.error ? (ERRORS[sp.error] ?? sp.error) : undefined} />
      <div className="card p-8">
        <span className="mb-4 inline-grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-950 text-white">
          {as === "admin" ? <IconShield className="h-6 w-6" /> : <IconUser className="h-6 w-6" />}
        </span>
        <div className="text-sm font-medium tracking-wide text-brand-600 uppercase dark:text-brand-400">
          {as === "admin" ? "Admin login" : "Faculty login"}
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Sign in with your college account</h1>
        <p className="muted mt-2 text-sm">
          {as === "admin"
            ? "For the HOD and Time Table Officers: approve room requests and allot rooms for CIE and college events."
            : "Request free classrooms, and drop a regular class you can't take."}{" "}
          Only <strong>@bmsce.ac.in</strong> accounts on the department list can sign in.
        </p>
        <div className="mt-6">
          <GoogleButton next={as === "admin" ? "/admin" : "/faculty"} />
        </div>
        <p className="muted mt-6 text-xs">Students don&apos;t need to sign in. The home page shows every room&apos;s allotment.</p>
      </div>
    </div>
  );
}

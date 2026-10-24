import SubmitButton from "./SubmitButton";
import Link from "next/link";
import { displayName, getPerson } from "@/lib/auth";
import { IconBuilding, IconCalendarCheck, IconDashboard, IconHome, IconLogin, IconLogout, IconShield } from "./Icons";
import PendingLink from "./PendingLink";
import ThemeToggle from "./ThemeToggle";

export default async function Navbar() {
  const person = await getPerson().catch(() => null);
  const links = [
    { href: "/", label: "Home", icon: <IconHome className="h-4 w-4" /> },
    { href: "/free", label: "Free slots", icon: <IconCalendarCheck className="h-4 w-4" /> },
    ...(person ? [{ href: "/faculty", label: "My dashboard", icon: <IconDashboard className="h-4 w-4" /> }] : []),
    ...(person?.role === "admin" ? [{ href: "/admin", label: "Admin", icon: <IconShield className="h-4 w-4" /> }] : []),
  ];
  return (
    <header className="sticky top-0 z-30 bg-gradient-to-r from-ink via-brand-950 to-brand-800 text-white shadow-lg shadow-brand-950/20 dark:border-b dark:border-brand-900/60 dark:from-black dark:via-black dark:to-brand-950">
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="mr-2 flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-inner">
            <IconBuilding className="h-5 w-5" />
          </span>
          <span className="leading-tight">
            Room Management
            <span className="block text-[11px] font-normal text-brand-300">BMSCE · Machine Learning</span>
          </span>
        </Link>
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {links.map((l) => (
            <PendingLink key={l.href} href={l.href} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-brand-100 hover:bg-white/10 hover:text-white">
              {l.icon}
              {l.label}
            </PendingLink>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {person ? (
            <>
              <span className="hidden text-brand-200 md:inline">
                {displayName(person)} · <span className="capitalize">{person.role}</span>
              </span>
              <form action="/auth/signout" method="post">
                <SubmitButton className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-3 py-1.5 hover:bg-white/10" pendingText="Logging out…">
                  <IconLogout className="h-4 w-4" /> Log out
                </SubmitButton>
              </form>
            </>
          ) : (
            <>
              <Link href="/login?as=faculty" className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-3 py-1.5 hover:bg-white/10">
                <IconLogin className="h-4 w-4" /> Login as Faculty
              </Link>
              <Link href="/login?as=admin" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-medium text-brand-950 hover:bg-brand-100">
                <IconShield className="h-4 w-4" /> Login as Admin
              </Link>
            </>
          )}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}

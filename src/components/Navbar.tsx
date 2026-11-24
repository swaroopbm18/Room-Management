import SubmitButton from "./SubmitButton";
import Link from "next/link";
import { displayName } from "@/lib/auth";
import type { Person } from "@/lib/types";
import { IconBuilding, IconCalendar, IconCalendarCheck, IconHome, IconLogin, IconLogout } from "./Icons";
import PendingLink from "./PendingLink";
import ColorPicker from "./ColorPicker";
import MenuButton from "./MenuButton";
import ThemeToggle from "./ThemeToggle";

const TOOL = "rounded-lg p-2 text-brand-700 hover:bg-brand-50 dark:text-brand-200 dark:hover:bg-white/10";

/**
 * The bar across the top of every page. Signed in, the pages are in the side navigation, so the bar
 * keeps the name, who is signed in and the theme buttons; signed out it also links the public pages.
 */
export default function Navbar({ person }: { person: Person | null }) {
  const links = [
    { href: "/", label: "Home", icon: <IconHome className="h-4 w-4" /> },
    { href: "/free", label: "Free slots", icon: <IconCalendarCheck className="h-4 w-4" /> },
    { href: "/classes", label: "Class timetables", icon: <IconCalendar className="h-4 w-4" /> },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-brand-100 bg-white/90 backdrop-blur-md print:hidden dark:border-brand-900/60 dark:bg-black/85">
      <nav className={`flex items-center gap-x-3 gap-y-2 px-3 sm:px-5 ${person ? "h-14" : "mx-auto max-w-7xl flex-wrap py-2.5 sm:px-6"}`}>
        {person && <MenuButton className={`${TOOL} lg:hidden`} />}
        <Link href="/" className="mr-1 flex min-w-0 items-center gap-2.5 font-semibold tracking-tight text-brand-950 dark:text-white">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-sm shadow-brand-900/20">
            <IconBuilding className="h-5 w-5" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate">
              <span className="sm:hidden">Room Management</span>
              <span className="hidden sm:inline">Class and Classroom Management</span>
            </span>
            <span className="block truncate text-[11px] font-normal text-brand-600 dark:text-brand-300">BMSCE · Machine Learning</span>
          </span>
        </Link>
        {!person && (
          <div className="flex flex-wrap items-center gap-1 text-sm">
            {links.map((l) => (
              <PendingLink key={l.href} href={l.href} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-brand-800 hover:bg-brand-50 dark:text-brand-100 dark:hover:bg-white/10">
                {l.icon}
                {l.label}
              </PendingLink>
            ))}
          </div>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1 text-sm sm:gap-2">
          {person ? (
            <>
              <span className="hidden items-center gap-2 md:flex">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-100" aria-hidden>
                  {(person.initials || person.full_name.slice(0, 2)).slice(0, 3).toUpperCase()}
                </span>
                <span className="leading-tight">
                  <span className="block max-w-56 truncate font-medium text-neutral-800 dark:text-neutral-100">{displayName(person)}</span>
                  <span className="block text-[11px] text-neutral-500 capitalize dark:text-neutral-400">{person.role}</span>
                </span>
              </span>
              <form action="/auth/signout" method="post">
                <SubmitButton
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-2.5 py-1.5 text-brand-800 hover:bg-brand-50 sm:px-3 dark:border-brand-800 dark:text-brand-100 dark:hover:bg-white/10"
                  pendingText="Logging out…"
                >
                  <IconLogout className="h-4 w-4" /> <span className="hidden sm:inline">Log out</span>
                </SubmitButton>
              </form>
            </>
          ) : (
            <Link href="/login" className="btn-primary px-3 py-1.5">
              <IconLogin className="h-4 w-4" /> Sign in
            </Link>
          )}
          <ColorPicker className={TOOL} />
          <ThemeToggle className={TOOL} />
        </div>
      </nav>
    </header>
  );
}

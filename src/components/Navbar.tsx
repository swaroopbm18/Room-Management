import Link from "next/link";
import { displayName, getPerson } from "@/lib/auth";
import ThemeToggle from "./ThemeToggle";

export default async function Navbar() {
  const person = await getPerson().catch(() => null);
  const links = [
    { href: "/", label: "Home" },
    { href: "/free", label: "Free slots" },
    ...(person ? [{ href: "/faculty", label: "My dashboard" }] : []),
    ...(person?.role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  return (
    <header className="sticky top-0 z-20 bg-brand-900 text-white shadow dark:border-b dark:border-brand-900 dark:bg-neutral-950">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="mr-2 flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-sm font-bold text-white">BM</span>
          <span>Room Management</span>
        </Link>
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-1.5 text-brand-100 hover:bg-white/10 hover:text-white">
              {l.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {person ? (
            <>
              <span className="hidden text-brand-200 md:inline">
                {displayName(person)} · <span className="capitalize">{person.role}</span>
              </span>
              <form action="/auth/signout" method="post">
                <button className="rounded-lg border border-white/30 px-3 py-1.5 hover:bg-white/10">Log out</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login?as=faculty" className="rounded-lg border border-white/30 px-3 py-1.5 hover:bg-white/10">
                Login as Faculty
              </Link>
              <Link href="/login?as=admin" className="rounded-lg bg-white px-3 py-1.5 font-medium text-brand-900 hover:bg-brand-100">
                Login as Admin
              </Link>
            </>
          )}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}

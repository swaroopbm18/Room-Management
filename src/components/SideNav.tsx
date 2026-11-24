"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ADMIN, GENERAL, isOn, MINE, type IconName, type NavItem, type NavSection } from "@/lib/nav";
import {
  IconActivity, IconArchive, IconBook, IconCalendar, IconCalendarCheck, IconChart, IconChevronDown, IconDashboard, IconDoor, IconFile, IconFlag, IconHome, IconInbox,
  IconLeave, IconMegaphone, IconPlus, IconShield, IconSidebar, IconSwap, IconTag, IconUser, IconUsers, IconX,
} from "./Icons";
import PendingLink from "./PendingLink";

const ICONS: Record<IconName, (p: { className?: string }) => React.ReactNode> = {
  home: IconHome, calendarCheck: IconCalendarCheck, calendar: IconCalendar, users: IconUsers, dashboard: IconDashboard, plus: IconPlus, book: IconBook,
  inbox: IconInbox, swap: IconSwap, flag: IconFlag, door: IconDoor, megaphone: IconMegaphone, archive: IconArchive, user: IconUser, leave: IconLeave,
  tag: IconTag, file: IconFile, chart: IconChart, activity: IconActivity,
};
const Icon = ({ name, className = "h-[18px] w-[18px] shrink-0" }: { name: IconName; className?: string }) => {
  const C = ICONS[name];
  return <C className={className} />;
};

/** Opens the phone drawer; the menu button in the top bar sends it. */
export const OPEN_EVENT = "sidenav:open";

function Badge({ n, rail = true }: { n: number; rail?: boolean }) {
  return (
    <span
      className={`ml-auto rounded-full bg-amber-400 px-1.5 text-[11px] leading-[18px] font-semibold text-black ${rail ? "rail:absolute rail:top-0.5 rail:right-0.5 rail:ml-0 rail:px-1 rail:text-[10px] rail:leading-4" : ""}`}
      aria-label={`${n} pending`}
    >
      {n}
    </span>
  );
}

function Item({ item, path, pending, rail = true }: { item: NavItem; path: string; pending: number; rail?: boolean }) {
  const on = isOn(path, item);
  const n = item.badge === "pending" ? pending : 0;
  return (
    <PendingLink
      href={item.href}
      aria-current={on ? "page" : undefined}
      title={item.label}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${rail ? "rail:justify-center rail:px-0" : ""} ${
        on ? "bg-white text-brand-950 shadow-sm" : "text-brand-100/85 hover:bg-white/10 hover:text-white"
      }`}
    >
      {on && <span className="absolute top-1.5 bottom-1.5 -left-3 w-1 rounded-r bg-spot-400 rail:-left-2" aria-hidden />}
      <Icon name={item.icon} />
      <span className={`truncate ${rail ? "rail:sr-only" : ""}`}>{item.label}</span>
      {n > 0 && <Badge n={n} rail={rail} />}
    </PendingLink>
  );
}

function SectionHead({ children, rail = true }: { children: React.ReactNode; rail?: boolean }) {
  return <div className={`px-3 pt-5 pb-1.5 text-[11px] font-semibold tracking-wider text-brand-300/80 uppercase ${rail ? "rail:sr-only" : ""}`}>{children}</div>;
}

/** An admin group: its pages fold away under its name, and the group of the open page starts open. */
function Group({ g, path, pending, open, toggle, rail }: { g: NavSection; path: string; pending: number; open: boolean; toggle: () => void; rail: boolean }) {
  const here = g.items.some((t) => isOn(path, t));
  const n = g.items.some((t) => t.badge === "pending") ? pending : 0;
  if (g.items.length === 1) return <Item item={g.items[0]} path={path} pending={pending} rail={rail} />;
  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-white/10 hover:text-white ${here ? "text-white" : "text-brand-100/85"} ${rail ? "rail:hidden" : ""}`}
      >
        <Icon name={g.icon ?? g.items[0].icon} />
        <span className="truncate">{g.label}</span>
        {!open && n > 0 && <Badge n={n} rail={rail} />}
        <IconChevronDown className={`h-4 w-4 shrink-0 opacity-70 transition-transform ${n > 0 && !open ? "" : "ml-auto"} ${open ? "rotate-180" : ""}`} />
      </button>
      {/* In the narrow rail every page shows as an icon; otherwise only an open group's pages show */}
      <div className={`${open ? "mt-0.5 space-y-0.5 border-l border-white/10 pl-3 ml-5" : "hidden"} ${rail ? "rail:ml-0 rail:block rail:space-y-0.5 rail:border-0 rail:pl-0" : ""}`}>
        {g.items.map((t) => (
          <Item key={t.href} item={t} path={path} pending={pending} rail={rail} />
        ))}
      </div>
    </div>
  );
}

function Links({ admin, pending, rail }: { admin: boolean; pending: number; rail: boolean }) {
  const path = usePathname();
  const current = ADMIN.find((g) => g.items.some((t) => isOn(path, t)))?.label;
  const [open, setOpen] = useState<Set<string>>(() => new Set(current ? [current] : []));
  // Moving to a page in another group opens that group too
  useEffect(() => {
    if (current) setOpen((s) => (s.has(current) ? s : new Set(s).add(current)));
  }, [current]);
  const toggle = (label: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  return (
    <>
      {[GENERAL, MINE].map((s) => (
        <div key={s.label}>
          <SectionHead rail={rail}>{s.label}</SectionHead>
          <div className="space-y-0.5">
            {s.items.map((t) => (
              <Item key={t.href} item={t} path={path} pending={pending} rail={rail} />
            ))}
          </div>
        </div>
      ))}
      {admin && (
        <div>
          <SectionHead rail={rail}>
            <span className="inline-flex items-center gap-1.5">
              <IconShield className="h-3.5 w-3.5" /> Admin
            </span>
          </SectionHead>
          {rail && <div className="mx-3 my-2 hidden border-t border-white/10 rail:block" aria-hidden />}
          <div className="space-y-0.5">
            {ADMIN.map((g) => (
              <Group key={g.label} g={g} path={path} pending={pending} open={open.has(g.label)} toggle={() => toggle(g.label)} rail={rail} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const PANEL = "bg-gradient-to-b from-ink via-brand-950 to-brand-950 text-white dark:from-black dark:via-ink dark:to-ink";

/**
 * The side navigation on every page for signed-in staff: a column on the left from laptop width up
 * (narrowed to icons with the button at its foot, remembered on this device), and a drawer opened
 * from the menu button in the top bar on phones and tablets.
 */
export default function SideNav({ admin, pending }: { admin: boolean; pending: number }) {
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    const show = () => setDrawer(true);
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);
  // A link in the drawer closes it
  useEffect(() => setDrawer(false), [path]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawer]);

  function toggleRail() {
    const root = document.documentElement;
    const rail = root.dataset.nav !== "rail";
    if (rail) root.dataset.nav = "rail";
    else delete root.dataset.nav;
    try {
      localStorage.setItem("nav", rail ? "rail" : "full");
    } catch {}
  }

  return (
    <>
      <aside
        className={`sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[17rem] shrink-0 flex-col border-r border-brand-900/40 lg:flex rail:w-[4.25rem] print:hidden ${PANEL}`}
        aria-label="Site"
      >
        <nav className="flex-1 overflow-y-auto px-3 pb-4 [scrollbar-width:thin] rail:px-2" aria-label="Pages">
          <Links admin={admin} pending={pending} rail />
        </nav>
        <div className="border-t border-white/10 p-3 rail:px-2">
          <button
            type="button"
            onClick={toggleRail}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-200 hover:bg-white/10 hover:text-white rail:justify-center rail:px-0"
            title="Narrow or widen the menu"
          >
            <IconSidebar className="h-[18px] w-[18px] shrink-0" />
            <span className="rail:sr-only">Collapse menu</span>
          </button>
        </div>
      </aside>

      {/* Phones and tablets */}
      <div className={`fixed inset-0 z-50 lg:hidden print:hidden ${drawer ? "" : "pointer-events-none"}`} aria-hidden={!drawer}>
        <div className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity ${drawer ? "opacity-100" : "opacity-0"}`} onClick={() => setDrawer(false)} />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={`absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col shadow-2xl transition-transform duration-200 ${PANEL} ${drawer ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
            <span className="font-semibold">Menu</span>
            <button type="button" onClick={() => setDrawer(false)} className="rounded-lg p-2 text-brand-100 hover:bg-white/10" aria-label="Close menu" tabIndex={drawer ? 0 : -1}>
              <IconX className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 pb-6" aria-label="Pages" inert={!drawer}>
            <Links admin={admin} pending={pending} rail={false} />
          </nav>
        </div>
      </div>
    </>
  );
}

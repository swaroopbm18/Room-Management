"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

type Credit = { name: string; short: string; initials: string; role: string; href: string };

const DEVELOPERS: Credit[] = [
  {
    name: "Prof. Swaroop BM",
    short: "Swaroop BM",
    initials: "SB",
    role: "Assistant Professor, Dept. of Machine Learning, BMSCE",
    href: "https://bmsce.ac.in/home/facultyProfile/590/Swaroop-BM",
  },
  {
    name: "Sinchana B M",
    short: "Sinchana B M",
    initials: "SM",
    role: "Student, Computer Science and Engineering (Data Science), BMSCE",
    href: "https://www.linkedin.com/in/sinchana-b-m-aa698a32b",
  },
];

/** Acknowledged for mentoring the project. */
const MENTOR: Credit = {
  name: "Dr. Sandeep Varma N",
  short: "Dr. Sandeep Varma N",
  initials: "SV",
  role: "HoD, Department of Machine Learning, BMSCE",
  href: "https://bmsce.ac.in/home/facultyProfile/156/Dr-Sandeep-Varma-N",
};

const KEY = "footer:credits-open";
const NAME_LINK = "font-semibold text-white underline-offset-2 hover:underline";

/** One person in the open credits panel: initials, name, role, with a link to their profile. */
function Card({ c, note }: { c: Credit; note?: string }) {
  return (
    <a
      href={c.href}
      target="_blank"
      rel="noopener"
      className="flex items-start gap-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10 transition hover:bg-white/10 hover:ring-brand-400"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-xs font-semibold shadow-inner">
        {c.initials}
      </span>
      <span className="min-w-0 leading-snug">
        <span className="block text-sm font-semibold">{c.name}</span>
        <span className="block text-xs text-brand-200/90">{c.role}</span>
        {note && <span className="mt-1 block text-xs text-brand-100">{note}</span>}
      </span>
    </a>
  );
}

/**
 * The credits bar pinned to the bottom of every page: one slim line (two on a phone) that fits any screen, naming
 * the developers and the mentor. "Credits" opens a panel with each person's role and profile;
 * the choice is remembered on this device.
 */
export default function DeveloperCredit() {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "1") setOpen(true);
    } catch {
      // storage can be unavailable; the panel starts closed
    }
  }, []);

  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(KEY, v ? "0" : "1");
      } catch {
        // ignore
      }
      return !v;
    });
  };

  return (
    <footer className="sticky bottom-0 z-30 border-t border-white/10 bg-gradient-to-r from-ink via-brand-950 to-brand-800 text-white shadow-[0_-8px_24px_-12px_rgba(11,21,51,0.45)] print:hidden dark:border-brand-900/60 dark:from-black dark:via-black dark:to-brand-950">
      {open && (
        <div id={panelId} className="mx-auto max-h-[60vh] max-w-7xl overflow-y-auto border-b border-white/10 px-4 pt-3 pb-3 sm:px-6">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <div className="mb-2 text-[11px] font-semibold tracking-widest text-brand-300 uppercase">Developed by</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {DEVELOPERS.map((d) => (
                  <Card key={d.name} c={d} />
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold tracking-widest text-brand-300 uppercase">Acknowledgement</div>
              <Card c={MENTOR} note="With thanks for mentoring this project." />
            </div>
          </div>
          <Link href="/privacy" className="mt-3 inline-block text-xs text-brand-200 underline underline-offset-2 hover:text-white sm:hidden">
            Privacy
          </Link>
        </div>
      )}
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-xs sm:px-6 sm:text-[13px]">
        {/* One line on wide screens, two on a phone; the full credits are a click away */}
        <div className="flex min-w-0 flex-1 flex-col text-brand-200 md:flex-row md:items-center">
          <span className="truncate">
            Developed by{" "}
            {DEVELOPERS.map((d, i) => (
              <span key={d.name}>
                {i > 0 && " & "}
                <a href={d.href} target="_blank" rel="noopener" title={`${d.name}, ${d.role}`} className={NAME_LINK}>
                  {d.name !== d.short && <span className="hidden sm:inline">{d.name.slice(0, d.name.length - d.short.length)}</span>}
                  {d.short}
                </a>
              </span>
            ))}
          </span>
          <span className="mx-2 hidden text-brand-400 md:inline" aria-hidden>
            ·
          </span>
          <span className="truncate">
            Mentored by{" "}
            <a href={MENTOR.href} target="_blank" rel="noopener" title={`${MENTOR.name}, ${MENTOR.role}`} className={NAME_LINK}>
              {MENTOR.short}
            </a>
            <span className="hidden text-brand-300 lg:inline">, HoD, Dept. of Machine Learning</span>
          </span>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-medium text-brand-100 ring-1 ring-white/20 transition hover:bg-white/10 hover:text-white"
        >
          Credits
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={`h-3.5 w-3.5 transition ${open ? "" : "rotate-180"}`}>
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
        <Link href="/privacy" className="hidden shrink-0 text-brand-200 sm:inline underline-offset-2 hover:text-white hover:underline">
          Privacy
        </Link>
      </div>
    </footer>
  );
}

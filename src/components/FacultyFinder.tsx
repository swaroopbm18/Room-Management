"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IconSearch, IconX } from "@/components/Icons";

/** One class slot; `href` and `linkLabel` say where its link goes, e.g. that day's grid. */
export type FinderClass = { day: number; room: string; slotId: number; time: string; subject: string; initials: string[]; href: string; linkLabel: string };

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Find a faculty member by name or initials and see every class they have in the week. */
export default function FacultyFinder({ people, classes }: { people: { initials: string; name: string }[]; classes: FinderClass[] }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const query = q.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!query) return [];
    const plain = (s: string) => s.toLowerCase().replace(/^(dr|prof|mr|ms|mrs)\.?\s*/, "");
    return people
      .filter((p) => p.initials.toLowerCase().includes(query) || plain(p.name).includes(query) || p.name.toLowerCase().includes(query))
      .sort((a, b) => Number(b.initials.toLowerCase() === query) - Number(a.initials.toLowerCase() === query) || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [people, query]);

  // An exact initials match, or the only match, opens straight away
  const chosen = picked ?? (matches.length === 1 ? matches[0].initials : matches.find((m) => m.initials.toLowerCase() === query)?.initials) ?? null;
  const person = people.find((p) => p.initials === chosen);
  const week = chosen ? classes.filter((c) => c.initials.includes(chosen)).sort((a, b) => a.day - b.day || a.slotId - b.slotId) : [];

  return (
    <section className="card space-y-3 p-4">
      <label className="relative block sm:max-w-md">
        <span className="label">Find a faculty member</span>
        <IconSearch className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-brand-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPicked(null);
          }}
          onKeyDown={(e) => e.key === "Escape" && (setQ(""), setPicked(null))}
          placeholder="Name or initials, e.g. Kavitha or AKN"
          className="input pr-8 pl-9"
          aria-describedby="finder-result"
        />
        {q && (
          <button
            type="button"
            onClick={() => (setQ(""), setPicked(null))}
            aria-label="Clear search"
            className="absolute right-2 bottom-2 rounded p-1 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            <IconX className="h-3.5 w-3.5" />
          </button>
        )}
      </label>

      <div id="finder-result" aria-live="polite">
        {query && matches.length === 0 && <p className="muted text-sm">Nobody matches “{q}”.</p>}
        {matches.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {matches.map((m) => (
              <button
                key={m.initials}
                type="button"
                onClick={() => setPicked(m.initials)}
                aria-pressed={chosen === m.initials}
                className={`rounded-lg px-2.5 py-1.5 text-sm font-medium ${chosen === m.initials ? "bg-brand-700 text-white dark:bg-brand-600" : "bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-200"}`}
              >
                {m.name} <span className="opacity-70">· {m.initials}</span>
              </button>
            ))}
          </div>
        )}
        {person && (
          <div className="mt-3 space-y-2">
            <p className="text-sm">
              <span className="font-semibold">{person.name}</span> <span className="muted">· {person.initials}</span> ·{" "}
              {week.length === 0 ? "no classes in the regular timetable from tomorrow." : `${week.length} class slot${week.length === 1 ? "" : "s"} a week:`}
            </p>
            {week.length > 0 && (
              <ul className="divide-y divide-brand-100 rounded-lg border border-brand-100 text-sm dark:divide-brand-900 dark:border-brand-900">
                {week.map((c) => (
                  <li key={`${c.day}|${c.room}|${c.slotId}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
                    <span>
                      <span className="font-medium">{DAYS[c.day - 1]}</span> · {c.time} · {c.subject} · {c.room}
                      {c.initials.length > 1 && <span className="muted"> · with {c.initials.filter((i) => i !== person.initials).join(", ")}</span>}
                    </span>
                    <Link href={c.href} scroll={false} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
                      {c.linkLabel}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

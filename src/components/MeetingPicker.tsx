"use client";

import { useState } from "react";

type Member = { initials: string; name: string; cluster?: "A" | "B" };
type Group = "all" | "A" | "B";

/**
 * Who a meeting is for: a group, and inside it the faculty ticked. The list only shows the
 * group picked, so ticking narrows that group; with nobody ticked, the whole group is invited.
 */
export default function MeetingPicker({
  faculty,
  groups,
  group: start,
  ticked,
  children,
}: {
  faculty: Member[];
  groups: { value: Group; label: string }[];
  group: Group;
  ticked: string[];
  /** The rest of the form's first row, after the group. */
  children?: React.ReactNode;
}) {
  const [group, setGroup] = useState<Group>(start);
  const [chosen, setChosen] = useState(() => new Set(ticked));
  const [query, setQuery] = useState("");

  const inGroup = faculty.filter((f) => group === "all" || f.cluster === group);
  const q = query.trim().toLowerCase();
  const matches = (f: Member) => !q || f.name.toLowerCase().includes(q) || f.initials.toLowerCase().includes(q);
  const tickedHere = inGroup.filter((f) => chosen.has(f.initials));
  const groupLabel = groups.find((g) => g.value === group)?.label ?? "";
  const toggle = (ini: string, on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(ini);
      else next.delete(ini);
      return next;
    });

  return (
    <>
      <div>
        <label className="label" htmlFor="meet-who">Who should attend</label>
        <select
          id="meet-who"
          name="who"
          value={group}
          onChange={(e) => {
            setGroup(e.target.value as Group);
            setChosen(new Set());
            setQuery("");
          }}
          className="input"
        >
          {groups.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label} · {faculty.filter((f) => g.value === "all" || f.cluster === g.value).length}
            </option>
          ))}
        </select>
      </div>
      {children}
      <div className="sm:col-span-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm font-medium">
            {tickedHere.length ? `Only the ${tickedHere.length} ticked` : `Everyone in ${groupLabel}`}
            <span className="muted font-normal"> · tick names to invite only them</span>
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or initials"
            aria-label="Search faculty"
            className="input w-full sm:ml-auto sm:w-64"
          />
          {tickedHere.length > 0 && (
            <button type="button" onClick={() => setChosen(new Set())} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
              Clear ticks
            </button>
          )}
        </div>
        {tickedHere.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tickedHere.map((f) => (
              <button
                key={f.initials}
                type="button"
                onClick={() => toggle(f.initials, false)}
                className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-800 hover:bg-brand-200 dark:bg-brand-950 dark:text-brand-200 dark:hover:bg-brand-900"
                title={`Remove ${f.name}`}
              >
                {f.initials} ×
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 grid max-h-80 gap-x-4 gap-y-1.5 overflow-y-auto text-sm sm:grid-cols-2 lg:grid-cols-3">
          {inGroup.map((f) => (
            // Hidden by the search, not removed, so a ticked name still goes with the form
            <label key={f.initials} className={`flex items-center gap-2 ${matches(f) ? "" : "hidden"}`}>
              <input
                type="checkbox"
                name="p"
                value={f.initials}
                checked={chosen.has(f.initials)}
                onChange={(e) => toggle(f.initials, e.target.checked)}
                className="h-4 w-4 accent-brand-600"
              />
              <span className="truncate">{f.name}</span>
              <span className="muted text-xs">{f.initials}</span>
            </label>
          ))}
          {inGroup.length === 0 && <p className="muted">Nobody is in {groupLabel} yet.</p>}
          {inGroup.length > 0 && !inGroup.some(matches) && <p className="muted">No one in {groupLabel} matches “{query}”.</p>}
        </div>
      </div>
    </>
  );
}

"use client";

import { useMemo, useState } from "react";

export type PickFaculty = { initials: string; name: string; cluster?: "A" | "B" };

/**
 * Several faculty for an event, CIE or SEE: tick names, or pick a whole cluster or the whole
 * department in one go (and untick a few after). Optional. Sends `name`: "" for none, "@A",
 * "@B" or "@ALL" when exactly a whole group is picked, otherwise comma-separated initials.
 */
export default function FacultyPicker({
  faculty,
  name = "faculty",
  id = "faculty",
  label = "Faculty in charge",
  emptyText = "None",
}: {
  faculty: PickFaculty[];
  name?: string;
  id?: string;
  label?: string;
  emptyText?: string;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const groups = useMemo(
    () => ({
      A: faculty.filter((f) => f.cluster === "A").map((f) => f.initials),
      B: faculty.filter((f) => f.cluster === "B").map((f) => f.initials),
      ALL: faculty.map((f) => f.initials),
    }),
    [faculty],
  );
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const group = (["A", "B", "ALL"] as const).find((g) => groups[g].length > 0 && same(picked, groups[g]));
  const value = group ? `@${group}` : picked.join(",");
  const nameOf = new Map(faculty.map((f) => [f.initials, f.name]));
  const summary = !picked.length
    ? emptyText
    : group === "ALL"
      ? `Whole department (${picked.length})`
      : group
        ? `Cluster ${group} (${picked.length})`
        : picked.length <= 2
          ? picked.map((i) => nameOf.get(i) ?? i).join(", ")
          : `${picked.length} faculty`;
  const add = (list: string[]) => setPicked((p) => [...p, ...list.filter((x) => !p.includes(x))]);
  const shown = faculty.filter((f) => !query || `${f.name} ${f.initials}`.toLowerCase().includes(query.toLowerCase()));
  const chip = "rounded-lg border border-brand-200 px-2 py-1 text-xs font-medium hover:bg-brand-50 dark:border-brand-800 dark:hover:bg-brand-950";

  return (
    <div>
      <span className="label" id={`${id}-label`}>
        {label} <span className="muted font-normal">(optional)</span>
      </span>
      <input type="hidden" name={name} value={value} />
      <details className="group relative">
        <summary aria-labelledby={`${id}-label`} className="input flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
          <span className="truncate">{summary}</span>
          <span aria-hidden className="muted text-xs">▾</span>
        </summary>
        <div className="absolute z-20 mt-1 w-full min-w-[18rem] space-y-2 rounded-xl border border-brand-100 bg-white p-3 shadow-xl dark:border-brand-900 dark:bg-ink">
          <div className="flex flex-wrap gap-1.5">
            {groups.A.length > 0 && (
              <button type="button" className={chip} onClick={() => add(groups.A)}>+ Cluster A</button>
            )}
            {groups.B.length > 0 && (
              <button type="button" className={chip} onClick={() => add(groups.B)}>+ Cluster B</button>
            )}
            <button type="button" className={chip} onClick={() => setPicked(groups.ALL)}>Whole department</button>
            {picked.length > 0 && (
              <button type="button" className={`${chip} text-red-600 dark:text-red-400`} onClick={() => setPicked([])}>Clear</button>
            )}
          </div>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search faculty" className="input py-1.5 text-sm" aria-label="Search faculty" />
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {shown.map((f) => (
              <label key={f.initials} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-brand-50 dark:hover:bg-brand-950">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-600"
                  checked={picked.includes(f.initials)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, f.initials] : p.filter((x) => x !== f.initials)))}
                />
                <span className="min-w-0 flex-1 truncate">{f.name === f.initials ? f.initials : `${f.name} (${f.initials})`}</span>
                {f.cluster && <span className="muted text-xs">{f.cluster}</span>}
              </label>
            ))}
            {shown.length === 0 && <p className="muted px-1.5 py-1 text-sm">No faculty match.</p>}
          </div>
        </div>
      </details>
    </div>
  );
}

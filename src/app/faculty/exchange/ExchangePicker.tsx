"use client";

import { useState } from "react";
import type { Candidate } from "@/lib/exchanges";

const busyText = (n: number) => (n === 0 ? "free all day" : `${n} slot${n === 1 ? "" : "s"} busy that day`);

/**
 * Who to ask, in two tabs: faculty who teach the same class first (e.g. 3A), then every other
 * faculty member free then. One choice goes with the form, whichever tab it is in.
 */
export default function ExchangePicker({ classLabel, sameClass, others }: { classLabel: string | null; sameClass: Candidate[]; others: Candidate[] }) {
  const [tab, setTab] = useState<"class" | "others">(sameClass.length || !others.length ? "class" : "others");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string>("");
  const q = query.trim().toLowerCase();
  const tabs = [
    { key: "class" as const, label: classLabel ? `Teach ${classLabel}` : "Teach this class", list: sameClass },
    { key: "others" as const, label: "Other free faculty", list: others },
  ];
  const all = [...sameClass, ...others];
  const chosen = all.find((c) => c.initials === picked);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 rounded-xl bg-brand-100 p-1 text-sm dark:bg-brand-950" role="tablist" aria-label="Who to ask">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-4 py-1.5 font-medium ${tab === t.key ? "bg-white text-brand-950 shadow-sm dark:bg-brand-700 dark:text-white" : "text-brand-700 hover:bg-white/60 dark:text-brand-300 dark:hover:bg-brand-900"}`}
            >
              {t.label}
              <span className={`ml-1.5 rounded-full px-1.5 text-xs ${tab === t.key ? "bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-100" : "bg-white/70 dark:bg-brand-900"}`}>{t.list.length}</span>
            </button>
          ))}
        </div>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or initials" aria-label="Search faculty" className="input w-full sm:ml-auto sm:w-64" />
      </div>

      {tabs.map((t) => {
        const shown = t.list.filter((c) => !q || c.name.toLowerCase().includes(q) || c.initials.toLowerCase().includes(q));
        return (
          // Both lists stay in the form so a choice made in one tab is still sent from the other
          <div key={t.key} role="tabpanel" className={tab === t.key ? "" : "hidden"}>
            {t.key === "class" && classLabel && (
              <p className="muted mb-2 text-sm">Free then and already teach {classLabel}, so the students know them and they can take their own subject in this slot.</p>
            )}
            {t.key === "others" && <p className="muted mb-2 text-sm">Everyone else free in this slot, lightest day first.</p>}
            {shown.length === 0 ? (
              <p className="card muted p-4 text-sm">{t.list.length ? `No one here matches “${query}”.` : t.key === "class" ? `Nobody who teaches ${classLabel ?? "this class"} is free then. Try Other free faculty.` : "Nobody else is free then."}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {shown.map((c) => {
                  const value = `${c.initials}|${c.name}|${c.teaches ?? ""}`;
                  const on = picked === c.initials;
                  return (
                    <li key={c.initials}>
                      <label
                        className={`flex h-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${
                          !c.canAccept
                            ? "cursor-not-allowed border-dashed border-brand-200 opacity-60 dark:border-brand-900"
                            : on
                              ? "border-brand-600 bg-brand-50 ring-2 ring-brand-500 dark:border-brand-500 dark:bg-brand-950"
                              : "border-brand-200 bg-white hover:border-brand-400 dark:border-brand-900 dark:bg-ink dark:hover:border-brand-700"
                        }`}
                      >
                        <input type="radio" name="target" value={value} disabled={!c.canAccept} checked={on} onChange={() => setPicked(c.initials)} className="mt-0.5 h-4 w-4 accent-brand-600" />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-medium">{c.name}</span>
                            <span className="muted text-xs">{c.initials}</span>
                            {c.cluster && <span className="muted text-xs">· Cluster {c.cluster}</span>}
                          </span>
                          <span className="mt-0.5 block text-xs">
                            {c.teaches && <span className="mr-1.5 rounded bg-brand-600 px-1.5 py-0.5 font-medium text-white dark:bg-brand-500 dark:text-black">teaches {c.teaches}</span>}
                            <span className="muted">{c.canAccept ? busyText(c.load) : "Not signed in to the site yet, so can't accept"}</span>
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      <p className="text-sm" aria-live="polite">
        {chosen ? (
          <>
            You&apos;re asking <span className="font-semibold">{chosen.name}</span>
            {chosen.teaches ? <> to take the slot for {chosen.teaches}.</> : <> to take the class.</>}
          </>
        ) : (
          <span className="muted">Pick one faculty member to ask.</span>
        )}
      </p>
    </div>
  );
}

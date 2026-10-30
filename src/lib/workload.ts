import { CLUSTERS, DAY_NAMES, DAY_SLOTS, DAYS, getFacultyWeeks, isFree, type FacultyMember } from "./faculty";

export type Workload = {
  f: FacultyMember;
  classes: number;
  duties: number;
  free: number;
  /** Teaching slots (classes and duties) on each day, Monday to Saturday */
  perDay: number[];
  subjects: string[];
};

/** Each faculty member's regular week in numbers: classes, other duties and free slots. */
export async function getWorkload(): Promise<Workload[]> {
  const { faculty, weeks } = await getFacultyWeeks();
  return faculty.map((f) => {
    const week = weeks.get(f.initials);
    const perDay = DAYS.map(() => 0);
    let classes = 0;
    let duties = 0;
    const subjects = new Set<string>();
    for (const [k, b] of week ?? []) {
      const [wd, slot] = k.split("|").map(Number);
      if (!DAY_SLOTS.includes(slot) || !b.length) continue;
      perDay[wd - 1]++;
      if (b.some((x) => x.source === "timetable")) classes++;
      else duties++;
      for (const x of b) if (x.source === "timetable") subjects.add(x.activity);
    }
    const free = DAYS.reduce((n, _, i) => n + DAY_SLOTS.filter((s) => isFree(weeks, f.initials, i + 1, s)).length, 0);
    return { f, classes, duties, free, perDay, subjects: [...subjects].sort() };
  });
}

export const clusterLabel = (f: FacultyMember) => (f.cluster ? CLUSTERS[f.cluster].label : "");

/** Header and rows for the Excel download. */
export function workloadRows(list: Workload[]): (string | number)[][] {
  return [
    ["Name", "Initials", "Cluster", "Classes a week", "Other duties", "Total busy", "Free slots", ...DAY_NAMES, "Subjects"],
    ...list.map((w) => [w.f.name, w.f.initials, clusterLabel(w.f), w.classes, w.duties, w.classes + w.duties, w.free, ...w.perDay, w.subjects.join(", ")]),
  ];
}

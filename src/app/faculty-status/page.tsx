import Link from "next/link";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import ClosedDay from "@/components/ClosedDay";
import { IconClock } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import { getFacultyStatus, getHolidays, getSlots, type FacultySlotStatus } from "@/lib/data";
import { DATE_RE, dateOption, defaultSlot, formatDate, isSunday, nextWorkingDay, todayIST, viewableDates } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Free and busy faculty",
  description: "Which faculty of the Department of Machine Learning, BMSCE, are free or busy in each slot, by cluster.",
  robots: { index: false },
};

type Cluster = "all" | "A" | "B";
const GROUPS = [
  { key: "A", label: "Cluster A" },
  { key: "B", label: "Cluster B" },
  { key: null, label: "Not in a cluster" },
] as const;

/** Free and busy faculty for one date: every slot at a glance, then who, by cluster, for the chosen slot. */
export default async function FacultyStatus({ searchParams }: { searchParams: Promise<{ date?: string; slot?: string; c?: string }> }) {
  const sp = await searchParams;
  const [slots, holidays] = await Promise.all([getSlots(), getHolidays()]);
  const today = todayIST();
  const fallback = defaultSlot(slots, holidays);
  const date = sp.date && DATE_RE.test(sp.date) && !isSunday(sp.date) ? sp.date : fallback.date;
  const slotId = slots.some((s) => String(s.id) === sp.slot) ? Number(sp.slot) : fallback.slotId;
  const slot = slots.find((s) => s.id === slotId)!;
  const cluster: Cluster = sp.c === "A" || sp.c === "B" ? sp.c : "all";
  const holiday = holidays.get(date);
  const dates = viewableDates();
  if (!dates.includes(date)) dates.push(date);
  dates.sort();

  const status = holiday ? [] : await getFacultyStatus(date);
  const inCluster = (rows: FacultySlotStatus[]) => (cluster === "all" ? rows : rows.filter((r) => r.cluster === cluster));
  const all = inCluster(status ?? []);
  const here = all.filter((r) => r.slot_id === slotId);
  const free = here.filter((r) => !r.busy).sort((a, b) => a.name.localeCompare(b.name));
  const busy = here.filter((r) => r.busy).sort((a, b) => a.name.localeCompare(b.name));
  const total = here.length;
  const href = (p: { slot?: number; c?: Cluster }) => {
    const q = new URLSearchParams({ date, slot: String(p.slot ?? slotId) });
    const c = p.c ?? cluster;
    if (c !== "all") q.set("c", c);
    return `/faculty-status?${q.toString()}`;
  };
  const start = (label: string) => label.split(" – ")[0];

  const groupsOf = (rows: FacultySlotStatus[]) =>
    GROUPS.filter((g) => cluster === "all" || g.key === cluster)
      .map((g) => ({ ...g, rows: rows.filter((r) => r.cluster === g.key) }))
      .filter((g) => g.rows.length > 0 || g.key !== null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Free and busy faculty"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <IconClock className="h-4 w-4" />
            {formatDate(date, { weekday: "long" })} · {slot.label}
          </span>
        }
      >
        <AutoSubmitSelect
          name="date"
          label="Date"
          value={date}
          keep={{ slot: String(slotId), ...(cluster !== "all" ? { c: cluster } : {}) }}
          options={dates.map((d) => ({ value: d, label: dateOption(d, holidays, d === today ? `Today, ${formatDate(d, { year: undefined })}` : formatDate(d)) }))}
        />
        <AutoSubmitSelect
          name="slot"
          label="Slot"
          value={String(slotId)}
          keep={{ date, ...(cluster !== "all" ? { c: cluster } : {}) }}
          options={slots.map((s) => ({ value: String(s.id), label: s.label }))}
        />
      </PageHeader>

      {holiday || isSunday(date) ? (
        <ClosedDay date={date} holiday={holiday} nextDate={nextWorkingDay(date, holidays)} nextHref={`/faculty-status?date=${nextWorkingDay(date, holidays)}&slot=${slotId}`} />
      ) : status === null ? (
        <div className="card muted p-6 text-sm">Free and busy faculty will show here once the admin runs the latest database update.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Cluster">
            {(["all", "A", "B"] as const).map((k) => {
              const n = new Set((status ?? []).filter((r) => k === "all" || r.cluster === k).map((r) => r.initials)).size;
              return (
                <Link
                  key={k}
                  href={href({ c: k })}
                  scroll={false}
                  role="tab"
                  aria-selected={k === cluster}
                  className={`rounded-xl border px-4 py-2 text-sm ${
                    k === cluster
                      ? "border-brand-700 bg-brand-700 text-white dark:border-brand-500 dark:bg-brand-600"
                      : "border-brand-200 bg-white text-brand-900 hover:bg-brand-50 dark:border-brand-900 dark:bg-ink dark:text-brand-100 dark:hover:bg-brand-950"
                  }`}
                >
                  <span className="font-semibold">{k === "all" ? "Whole department" : `Cluster ${k}`}</span>
                  <span className={`block text-xs ${k === cluster ? "text-brand-100" : "muted"}`}>{n} faculty</span>
                </Link>
              );
            })}
          </div>

          {/* Every slot of the day: how many are free, and a way to pick the slot */}
          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-100 px-4 py-3 text-xs dark:border-brand-900/70">
              <span className="font-semibold">Faculty free in each slot</span>
              <span className="muted">Click a slot to see who is free and who is busy.</span>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-5 lg:grid-cols-10">
              {slots.map((s) => {
                const rows = all.filter((r) => r.slot_id === s.id);
                const n = rows.filter((r) => !r.busy).length;
                const on = s.id === slotId;
                return (
                  <Link
                    key={s.id}
                    href={href({ slot: s.id })}
                    scroll={false}
                    aria-current={on ? "true" : undefined}
                    className={`rounded-xl px-3 py-2 transition ${
                      on
                        ? "bg-gradient-to-br from-brand-700 to-brand-950 text-white shadow-md ring-2 ring-brand-400"
                        : "bg-brand-50 text-brand-950 hover:bg-brand-100 dark:bg-brand-950/60 dark:text-brand-100 dark:hover:bg-brand-900"
                    }`}
                  >
                    <div className={`text-[11px] font-medium ${on ? "text-brand-200" : "text-brand-700 dark:text-brand-300"}`}>{start(s.label)}</div>
                    <div className="text-xl font-semibold tracking-tight">
                      {n}
                      <span className={`text-xs font-normal ${on ? "text-brand-200" : "muted"}`}> / {rows.length} free</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section id="free" className="card scroll-mt-24 overflow-hidden">
              <div className="flex items-baseline justify-between gap-2 bg-gradient-to-r from-brand-700 to-brand-900 px-4 py-3 text-white">
                <h2 className="font-semibold">Free · {free.length}</h2>
                <span className="text-xs text-brand-200">of {total} faculty</span>
              </div>
              <div className="divide-y divide-brand-100 dark:divide-brand-900">
                {groupsOf(free).map((g) => (
                  <div key={g.label} className="px-4 py-3">
                    <div className="mb-2 text-xs font-semibold tracking-wide text-brand-700 uppercase dark:text-brand-300">
                      {g.label} · {g.rows.length}
                    </div>
                    {g.rows.length === 0 ? (
                      <p className="muted text-sm">Nobody free.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {g.rows.map((r) => (
                          <span key={r.initials} className="rounded-lg bg-brand-100 px-2 py-1 text-sm text-brand-950 dark:bg-brand-900/70 dark:text-brand-50">
                            {r.name}
                            {r.name !== r.initials && <span className="ml-1 text-[11px] opacity-60">{r.initials}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section id="busy" className="card scroll-mt-24 overflow-hidden">
              <div className="flex items-baseline justify-between gap-2 bg-gradient-to-r from-ink to-brand-950 px-4 py-3 text-white dark:from-black">
                <h2 className="font-semibold">Busy · {busy.length}</h2>
                <span className="text-xs text-brand-200">of {total} faculty</span>
              </div>
              <div className="divide-y divide-brand-100 dark:divide-brand-900">
                {groupsOf(busy).map((g) => (
                  <div key={g.label} className="px-4 py-3">
                    <div className="mb-2 text-xs font-semibold tracking-wide text-brand-700 uppercase dark:text-brand-300">
                      {g.label} · {g.rows.length}
                    </div>
                    {g.rows.length === 0 ? (
                      <p className="muted text-sm">Nobody busy.</p>
                    ) : (
                      <ul className="space-y-1">
                        {g.rows.map((r) => (
                          <li key={r.initials} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                            <span className="font-medium">{r.name}</span>
                            <span className="muted text-xs">
                              {r.activity}
                              {r.room_id && <> · {r.room_id}</>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
          <p className="muted text-xs">
            Busy means teaching that day (dropped classes and rooms taken for events don&apos;t count), an approved booking, or another duty the admin has added.
            Clusters are set by the admin.
          </p>
        </>
      )}
    </div>
  );
}

/** One row of public.activity_log: a row of some table added, changed or removed. */
export type LogRow = {
  id: number;
  at: string;
  actor: string | null;
  txid: number;
  tbl: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  old: Record<string, unknown> | null;
  new: Record<string, unknown> | null;
};

/** Everything done in one go (one transaction), e.g. a CIE week or approving a request. */
export type Action = { id: number; at: string; actor: string | null; area: Area; lines: string[] };

export const AREAS = {
  requests: "Requests",
  bookings: "Bookings",
  timetable: "Timetable",
  faculty: "Faculty",
  rooms: "Rooms",
  calendar: "Calendar",
} as const;
export type Area = keyof typeof AREAS;

const AREA_OF: Record<string, Area> = {
  requests: "requests",
  allotments: "bookings",
  timetable_changes: "timetable",
  timetable_versions: "timetable",
  people: "faculty",
  faculty_directory: "faculty",
  faculty_clusters: "faculty",
  faculty_duties: "faculty",
  faculty_subjects: "faculty",
  faculty_leave: "faculty",
  rooms: "rooms",
  holidays: "calendar",
  day_orders: "calendar",
  notices: "calendar",
};
/** Tables in the order their lines read best when one action touches several. */
const ORDER = Object.keys(AREA_OF);

const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const KIND: Record<string, string> = {
  class_request: "class booking",
  event_request: "event booking",
  cie: "CIE",
  event: "event",
  drop: "class dropped",
  restore: "class restored",
};

const str = (v: unknown) => (v == null ? "" : String(v));
const day = (d: unknown) =>
  str(d) ? new Date(str(d) + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (xs: string[], max = 4) => {
  const u = [...new Set(xs.filter(Boolean))];
  return u.length > max ? `${u.slice(0, max).join(", ")} and ${u.length - max} more` : u.join(", ");
};

/** Plain-language lines for the rows of one table in one action. */
function describe(tbl: string, rows: LogRow[]): string[] {
  const ins = rows.filter((r) => r.op === "INSERT").map((r) => r.new!);
  const upd = rows.filter((r) => r.op === "UPDATE");
  const del = rows.filter((r) => r.op === "DELETE").map((r) => r.old!);
  const out: string[] = [];
  switch (tbl) {
    case "requests": {
      if (ins.length) {
        const r = ins[0];
        out.push(`${str(r.requester_name)} requested ${str(r.room_id)} on ${day(r.date)} for ${plural(ins.length, "slot")} (${str(r.type)}${r.subject ? `, ${str(r.subject)}` : ""})`);
      }
      const decided = upd.filter((u) => u.old?.status !== u.new?.status);
      for (const status of ["approved", "rejected", "withdrawn"]) {
        const g = decided.filter((u) => u.new?.status === status).map((u) => u.new!);
        if (g.length) out.push(`${plural(g.length, "request")} ${status}: ${list(g.map((r) => `${str(r.requester_name)}, ${str(r.room_id)} ${day(r.date)}`), 3)}`);
      }
      const moved = upd.filter((u) => u.old?.status === u.new?.status && u.old?.priority !== u.new?.priority);
      if (moved.length) out.push(`Request queue reordered for ${list(moved.map((u) => `${str(u.new?.room_id)} ${day(u.new?.date)}`))}`);
      break;
    }
    case "allotments": {
      const byKind = new Map<string, Record<string, unknown>[]>();
      for (const a of ins) byKind.set(str(a.kind), [...(byKind.get(str(a.kind)) ?? []), a]);
      for (const [k, g] of byKind) {
        const what = KIND[k] ?? k;
        const title = list(g.map((a) => str(a.title)), 2);
        out.push(`${what[0].toUpperCase()}${what.slice(1)}${title ? ` “${title}”` : ""} in ${list(g.map((a) => str(a.room_id)))} on ${list(g.map((a) => day(a.date)), 3)} (${plural(g.length, "slot")})`);
      }
      break;
    }
    case "timetable_changes":
      for (const c of ins) {
        const was = str(c.old_value) || "free";
        const now = str(c.new_value) || "free";
        out.push(`Timetable: ${str(c.room_id)} ${DAYS[Number(c.weekday)] ?? ""} ${plural((c.slot_ids as unknown[])?.length ?? 1, "slot")}, ${was} → ${now}, from ${day(c.effective_from)}`);
      }
      break;
    case "timetable_versions":
      for (const v of ins) out.push(`Uploaded a new timetable, from ${day(v.valid_from)}`);
      break;
    case "people":
      for (const p of ins) out.push(`Gave ${str(p.email)} sign-in as ${str(p.role)}`);
      for (const u of upd) {
        const o = u.old!;
        const n = u.new!;
        const what: string[] = [];
        if (o.role !== n.role) what.push(`role ${str(n.role)}`);
        if (o.active !== n.active) what.push(n.active ? "can sign in" : "no access");
        if (o.initials !== n.initials) what.push(n.initials ? `initials ${str(n.initials)}` : "initials removed");
        if (o.full_name !== n.full_name || o.title !== n.title) what.push(`name ${[str(n.title), str(n.full_name)].filter(Boolean).join(" ")}`);
        if (what.length) out.push(`Changed ${str(n.email)}: ${what.join(", ")}`);
      }
      for (const p of del) out.push(`Removed sign-in for ${str(p.email)}`);
      break;
    case "faculty_directory": {
      const gone = new Set(del.map((d) => str(d.initials)));
      for (const d of ins) out.push(`Added faculty ${str(d.initials)}${str(d.full_name).trim() ? ` (${[str(d.title), str(d.full_name)].join(" ").trim()})` : ""}`);
      for (const u of upd) out.push(`Renamed ${str(u.new?.initials)} to ${[str(u.new?.title), str(u.new?.full_name)].join(" ").trim() || "no name"}`);
      for (const d of del) if (!ins.length) out.push(`Deleted faculty ${str(d.initials)}`);
      if (ins.length && gone.size) out.push(`Initials changed from ${list([...gone])}`);
      break;
    }
    case "faculty_clusters": {
      const set = [...ins, ...upd.map((u) => u.new!)];
      if (set.length) out.push(`Clusters set: ${list(set.map((c) => `${str(c.initials)} → ${str(c.cluster)}`), 6)}`);
      if (del.length) out.push(`Taken out of a cluster: ${list(del.map((c) => str(c.initials)), 6)}`);
      break;
    }
    case "faculty_duties": {
      const who = list([...ins, ...upd.map((u) => u.new!), ...del].map((d) => str(d.initials)));
      out.push(`Other duties changed for ${who} (${plural(ins.length + upd.length, "slot")} set, ${del.length} cleared)`);
      break;
    }
    case "faculty_subjects":
      if (ins.length) out.push(`Subjects added: ${list(ins.map((s) => `${str(s.subject)} for ${str(s.email)}`), 3)}`);
      if (del.length) out.push(`Subjects removed: ${list(del.map((s) => `${str(s.subject)} for ${str(s.email)}`), 3)}`);
      break;
    case "faculty_leave":
      for (const l of ins) out.push(`${str(l.initials)} on leave ${l.starts_on === l.ends_on ? day(l.starts_on) : `${day(l.starts_on)} to ${day(l.ends_on)}`}${l.reason ? ` (${str(l.reason)})` : ""}`);
      for (const l of del) out.push(`Removed ${str(l.initials)}'s leave from ${day(l.starts_on)}`);
      break;
    case "rooms":
      for (const r of ins) out.push(`Added room ${str(r.id)}`);
      for (const u of upd) out.push(`Changed details of room ${str(u.new?.id)}`);
      for (const r of del) out.push(`Deleted room ${str(r.id)}`);
      break;
    case "holidays":
      for (const h of ins) out.push(`Holiday on ${day(h.date)}: ${str(h.name)}`);
      for (const h of del) out.push(`Removed the holiday on ${day(h.date)}`);
      break;
    case "day_orders":
      for (const o of [...ins, ...upd.map((u) => u.new!)]) out.push(`${day(o.date)} follows ${DAYS[Number(o.follows)] ?? ""}'s timetable`);
      for (const o of del) out.push(`${day(o.date)} back to its own timetable`);
      break;
    case "notices":
      for (const n of ins) out.push(`Notice “${str(n.message).slice(0, 80)}”, ${day(n.starts_on)} to ${day(n.ends_on)}`);
      for (const n of del) out.push(`Removed the notice “${str(n.message).slice(0, 80)}”`);
      break;
    default:
      out.push(`${rows.length} change(s) to ${tbl}`);
  }
  return out;
}

/** Groups log rows into actions, newest first. */
export function toActions(rows: LogRow[]): Action[] {
  const byTx = new Map<number, LogRow[]>();
  for (const r of rows) byTx.set(r.txid, [...(byTx.get(r.txid) ?? []), r]);
  const actions: Action[] = [];
  for (const g of byTx.values()) {
    const tables = [...new Set(g.map((r) => r.tbl))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    // Approving a request also books the room; the approval line says it all
    const approved = g.some((r) => r.tbl === "requests" && r.op === "UPDATE" && r.new?.status === "approved");
    const rowsOf = (t: string) =>
      g.filter((r) => r.tbl === t && !(approved && t === "allotments" && ["class_request", "event_request"].includes(String(r.new?.kind))));
    const lines = tables.flatMap((t) => (rowsOf(t).length ? describe(t, rowsOf(t)) : []));
    if (!lines.length) continue;
    const first = g.reduce((m, r) => (r.id < m.id ? r : m));
    actions.push({ id: Math.max(...g.map((r) => r.id)), at: first.at, actor: first.actor, area: AREA_OF[tables[0]] ?? "faculty", lines });
  }
  return actions.sort((a, b) => b.id - a.id);
}

/** The log tables of each area, to filter by. */
export const tablesOf = (area: Area) => Object.entries(AREA_OF).filter(([, a]) => a === area).map(([t]) => t);

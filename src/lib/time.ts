import type { Slot } from "./types";

// India has no daylight saving, so IST is always UTC+5:30.
const IST_OFFSET_MS = 330 * 60 * 1000;

/** A Date whose UTC fields read as the current wall-clock time in IST. */
export function istNow(now = new Date()): Date {
  return new Date(now.getTime() + IST_OFFSET_MS);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayIST(): string {
  return isoDate(istNow());
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export function isSunday(date: string): boolean {
  return new Date(date + "T00:00:00Z").getUTCDay() === 0;
}

/** The Monday of the week the date falls in (weeks run Monday to Saturday here). */
export function mondayOf(date: string): string {
  const day = new Date(date + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  return addDays(date, day === 0 ? 1 : 1 - day);
}

/** The first day after `date` that is neither a Sunday nor a holiday. */
export function nextWorkingDay(date: string, holidays: Map<string, string> = new Map()): string {
  let d = addDays(date, 1);
  while (isSunday(d) || holidays.has(d)) d = addDays(d, 1);
  return d;
}

/** The date itself, or the next day that is neither a Sunday nor a holiday. */
export function workingDay(date: string, holidays: Map<string, string> = new Map()): string {
  return isSunday(date) || holidays.has(date) ? nextWorkingDay(date, holidays) : date;
}

export function minutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function slotStarted(date: string, slot: Pick<Slot, "starts">): boolean {
  const today = todayIST();
  if (date !== today) return date < today;
  const n = istNow();
  return n.getUTCHours() * 60 + n.getUTCMinutes() >= minutes(slot.starts);
}

export function slotEnded(date: string, slot: Pick<Slot, "ends">): boolean {
  const today = todayIST();
  if (date !== today) return date < today;
  const n = istNow();
  return n.getUTCHours() * 60 + n.getUTCMinutes() >= minutes(slot.ends);
}

/**
 * The slot to show by default: the one running now, else the next one today,
 * else the first slot of the next working day.
 */
export function defaultSlot(slots: Slot[], holidays: Map<string, string> = new Map()): { date: string; slotId: number } {
  const n = istNow();
  const today = isoDate(n);
  const now = n.getUTCHours() * 60 + n.getUTCMinutes();
  const sorted = [...slots].sort((a, b) => minutes(a.starts) - minutes(b.starts));
  if (!isSunday(today) && !holidays.has(today)) {
    const current = sorted.find((s) => now < minutes(s.ends));
    if (current) return { date: today, slotId: current.id };
  }
  return { date: nextWorkingDay(today, holidays), slotId: sorted[0]?.id ?? 1 };
}

export function formatDate(date: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
    ...opts,
  });
}

export function formatDateTime(ts: string): string {
  return new Date(ts).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

/** Days from today, up to the 4-week booking window, without Sundays. Holidays are listed but can't be booked. */
export function bookableDates(): string[] {
  const out: string[] = [];
  const today = todayIST();
  for (let i = 0; i <= 28; i++) {
    const d = addDays(today, i);
    if (!isSunday(d)) out.push(d);
  }
  return out;
}

/** Days a week back and four weeks ahead, without Sundays, for browsing the timetable. */
export function viewableDates(): string[] {
  const out: string[] = [];
  const today = todayIST();
  for (let i = -7; i <= 28; i++) {
    const d = addDays(today, i);
    if (!isSunday(d)) out.push(d);
  }
  return out;
}

/** How a date reads in a dropdown: holidays are marked so nobody picks one expecting free rooms. */
export function dateOption(date: string, holidays: Map<string, string>, label = formatDate(date)): string {
  return holidays.has(date) ? `${label} · Holiday, can't be booked` : label;
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

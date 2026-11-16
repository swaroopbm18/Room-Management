import { displayName } from "./auth";
import { createClient } from "./supabase/server";
import type { Person } from "./types";

/** Every faculty member's display name by initials, e.g. MP → "Dr. Monika P" (people first, then the directory). */
export async function getFacultyNames(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const [dirRes, peopleRes] = await Promise.all([
    supabase.from("faculty_directory").select("initials, title, full_name"),
    supabase.from("people").select("initials, title, full_name").not("initials", "is", null),
  ]);
  const names = new Map<string, string>();
  for (const d of (dirRes.data ?? []) as { initials: string; title: string; full_name: string }[]) {
    if (d.full_name.trim()) names.set(d.initials.toUpperCase(), `${d.title} ${d.full_name}`.trim());
  }
  for (const p of (peopleRes.data ?? []) as Pick<Person, "initials" | "title" | "full_name">[]) {
    if (p.initials && p.full_name.trim()) names.set(p.initials.toUpperCase(), displayName(p));
  }
  return names;
}

// "Dr. MP", "Prof STN", "Dr.SVN": a title, then initials. Bare initials are left alone, since
// subject codes such as "SNA-7A" or "KDD-5" look the same.
const TITLED_INITIALS = /\b(Dr|Prof|Mr|Mrs|Ms)\.?\s*([A-Z]{2,4})\b/g;

/** Writes faculty initials after a title out in full: "Talk by Dr. MP Madam" → "Talk by Dr. Monika P Madam". */
export function expandInitials(text: string, names: Map<string, string>): string;
export function expandInitials(text: string | null, names: Map<string, string>): string | null;
export function expandInitials(text: string | null, names: Map<string, string>): string | null {
  if (!text) return text;
  return text.replace(TITLED_INITIALS, (whole, _title: string, ini: string) => names.get(ini) ?? whole);
}

/** The faculty a text names with a title and initials ("Dr. MP" → "Dr. Monika P"), in order, once each. */
export function namedFaculty(text: string | null, names: Map<string, string>): string[] {
  const out: string[] = [];
  for (const m of (text ?? "").matchAll(TITLED_INITIALS)) {
    const name = names.get(m[2]);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

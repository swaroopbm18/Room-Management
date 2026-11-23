import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { displayName } from "./auth";
import { createClient } from "./supabase/server";
import type { Person } from "./types";

type DirectoryRow = { initials: string; title: string; full_name: string };

/**
 * The faculty directory is public and changes rarely, so it is cached across requests (cleared by
 * refreshPages() after an admin change, and after 5 minutes at most).
 */
const cachedDirectory = unstable_cache(
  async (): Promise<DirectoryRow[]> => {
    const { data, error } = await createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
      .from("faculty_directory")
      .select("initials, title, full_name");
    if (error) throw new Error(error.message);
    return (data ?? []) as DirectoryRow[];
  },
  ["faculty-directory"],
  { revalidate: 300, tags: ["faculty-names"] },
);

/**
 * Every faculty member's display name by initials, e.g. MP → "Dr. Monika P" (people first, then
 * the directory). Read once per request. The sign-in list is private (admins read it all,
 * faculty only their own row), so it is read as the viewer, and only when someone is signed in.
 */
export const getFacultyNames = cache(async (): Promise<Map<string, string>> => {
  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const [directory, peopleRes] = await Promise.all([
    cachedDirectory().catch(() => [] as DirectoryRow[]),
    session.session ? supabase.from("people").select("initials, title, full_name").not("initials", "is", null) : Promise.resolve({ data: [] }),
  ]);
  const names = new Map<string, string>();
  for (const d of directory) {
    if (d.full_name.trim()) names.set(d.initials.toUpperCase(), `${d.title} ${d.full_name}`.trim());
  }
  for (const p of (peopleRes.data ?? []) as Pick<Person, "initials" | "title" | "full_name">[]) {
    if (p.initials && p.full_name.trim()) names.set(p.initials.toUpperCase(), displayName(p));
  }
  return names;
});

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

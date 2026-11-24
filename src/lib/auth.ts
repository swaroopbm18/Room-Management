import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Person } from "./types";

export const ALLOWED_DOMAIN = "bmsce.ac.in";

/** The signed-in person, if they are on the admin/faculty list. Looked up once per page load. */
export const getPerson = cache(async (): Promise<Person | null> => {
  const supabase = await createClient();
  // getClaims() checks the sign-in token's signature locally with the project's public key,
  // instead of asking Supabase Auth on every page as getUser() does. (With the older shared-
  // secret keys it falls back to getUser() by itself.)
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return null;
  const { data } = await supabase.rpc("current_person");
  const person = data as Person | null;
  return person?.email ? person : null;
});

export async function requireStaff(): Promise<Person> {
  const person = await getPerson();
  if (!person) redirect("/login?next=/faculty");
  return person;
}

export async function requireAdmin(): Promise<Person> {
  const person = await getPerson();
  if (!person) redirect("/login?next=/admin");
  if (person.role !== "admin") redirect("/faculty?error=" + encodeURIComponent("Your account does not have admin access."));
  return person;
}

export function displayName(p: Pick<Person, "title" | "full_name">): string {
  return p.title && !p.full_name.toLowerCase().startsWith(p.title.toLowerCase()) ? `${p.title} ${p.full_name}` : p.full_name;
}

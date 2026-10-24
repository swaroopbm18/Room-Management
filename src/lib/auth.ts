import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Person } from "./types";

export const ALLOWED_DOMAIN = "bmsce.ac.in";

/** The signed-in person, if they are on the admin/faculty list. */
export async function getPerson(): Promise<Person | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.rpc("current_person");
  const person = data as Person | null;
  return person?.email ? person : null;
}

export async function requireStaff(): Promise<Person> {
  const person = await getPerson();
  if (!person) redirect("/login?as=faculty");
  return person;
}

export async function requireAdmin(): Promise<Person> {
  const person = await getPerson();
  if (!person) redirect("/login?as=admin");
  if (person.role !== "admin") redirect("/faculty?error=" + encodeURIComponent("Your account does not have admin access."));
  return person;
}

export function displayName(p: Pick<Person, "title" | "full_name">): string {
  return p.title && !p.full_name.toLowerCase().startsWith(p.title.toLowerCase()) ? `${p.title} ${p.full_name}` : p.full_name;
}

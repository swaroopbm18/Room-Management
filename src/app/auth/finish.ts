import { NextResponse } from "next/server";
import { ALLOWED_DOMAIN } from "@/lib/auth";
import type { createClient } from "@/lib/supabase/server";

/**
 * After any Google sign-in: keep only department accounts and send them to the right page.
 * With no page asked for, admins land on Requests and faculty on their dashboard.
 */
export async function finishSignIn(supabase: Awaited<ReturnType<typeof createClient>>, origin: string, nextParam: string | null) {
  const asked = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : null;
  const fail = (error: string) => NextResponse.redirect(`${origin}/login?error=${error}${asked ? `&next=${encodeURIComponent(asked)}` : ""}`);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("auth");
  const email = (user.email ?? "").toLowerCase();
  if (!email.endsWith("@" + ALLOWED_DOMAIN)) {
    await supabase.auth.signOut();
    return fail("domain");
  }
  const { data: person } = await supabase.rpc("current_person");
  if (!person?.email) {
    await supabase.auth.signOut();
    return fail("not_registered");
  }
  if (asked?.startsWith("/admin") && person.role !== "admin") {
    return NextResponse.redirect(`${origin}/faculty?error=${encodeURIComponent("Your account does not have admin access, so you are signed in as faculty.")}`);
  }
  return NextResponse.redirect(`${origin}${asked ?? (person.role === "admin" ? "/admin" : "/faculty")}`);
}

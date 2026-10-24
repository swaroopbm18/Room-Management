import { NextResponse, type NextRequest } from "next/server";
import { ALLOWED_DOMAIN } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/faculty";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/faculty";
  const as = next.startsWith("/admin") ? "admin" : "faculty";
  const fail = (error: string) => NextResponse.redirect(`${origin}/login?as=${as}&error=${error}`);

  if (!code) return fail("auth");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return fail("auth");

  const email = (data.user.email ?? "").toLowerCase();
  if (!email.endsWith("@" + ALLOWED_DOMAIN)) {
    await supabase.auth.signOut();
    return fail("domain");
  }
  const { data: person } = await supabase.rpc("current_person");
  if (!person?.email) {
    await supabase.auth.signOut();
    return fail("not_registered");
  }
  if (as === "admin" && person.role !== "admin") {
    return NextResponse.redirect(`${origin}/faculty?error=${encodeURIComponent("Your account does not have admin access, so you are signed in as faculty.")}`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}

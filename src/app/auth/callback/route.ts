import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finishSignIn } from "../finish";

// Redirect-based Google sign-in (the fallback) lands here.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const supabase = await createClient();
  if (!code || (await supabase.auth.exchangeCodeForSession(code)).error) {
    return NextResponse.redirect(`${origin}/login?as=${next?.startsWith("/admin") ? "admin" : "faculty"}&error=auth`);
  }
  return finishSignIn(supabase, origin, next);
}

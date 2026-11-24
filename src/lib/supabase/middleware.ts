import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Keeps the Supabase session cookie fresh on every request from someone signed in. Visitors who
// aren't signed in have no session to refresh, so their requests skip the call to Supabase Auth
// (most traffic is people checking free rooms without signing in).
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"))) return response;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  // Refreshes an expired session and checks the token locally (see getPerson in lib/auth.ts)
  await supabase.auth.getClaims();
  return response;
}

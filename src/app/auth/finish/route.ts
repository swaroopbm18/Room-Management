import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finishSignIn } from "../finish";

// The Google sign-in button signs in on the page, then comes here for the department checks.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  return finishSignIn(await createClient(), origin, searchParams.get("next"));
}

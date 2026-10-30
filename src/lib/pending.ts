import { createClient } from "./supabase/server";
import { todayIST } from "./time";

/** Pending room requests from today on, for the count on the Admin link. Admins only. */
export async function pendingRequestCount(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("requests").select("group_id").eq("status", "pending").gte("date", todayIST());
  // One request can cover several slots, each its own row
  return new Set((data ?? []).map((r) => r.group_id)).size;
}

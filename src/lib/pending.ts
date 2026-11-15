import { createClient } from "./supabase/server";
import { todayIST } from "./time";

/** Pending room requests and accepted class exchanges from today on, for the count on the Admin link. Admins only. */
export async function pendingRequestCount(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("requests").select("group_id").eq("status", "pending").gte("date", todayIST());
  // One request can cover several slots, each its own row
  const requests = new Set((data ?? []).map((r) => r.group_id)).size;
  // Class exchanges a colleague accepted and that now wait for an admin
  const { count } = await supabase.from("class_exchanges").select("id", { count: "exact", head: true }).eq("status", "accepted").gte("date", todayIST());
  return requests + (count ?? 0);
}

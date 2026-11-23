import { cache } from "react";
import { createClient } from "./supabase/server";
import { todayIST } from "./time";

/**
 * Pending room requests and accepted class exchanges from today on, for the count on the Admin
 * link and the admin menu. Admins only. Read once per request (both the navbar and the admin
 * layout ask for it), counted in the database (migration 0039), with the old way as a fallback
 * until that migration has been run.
 */
export const pendingRequestCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pending_admin_count");
  if (!error && typeof data === "number") return data;

  const today = todayIST();
  const [requests, exchanges] = await Promise.all([
    supabase.from("requests").select("group_id").eq("status", "pending").gte("date", today),
    // Class exchanges a colleague accepted and that now wait for an admin
    supabase.from("class_exchanges").select("id", { count: "exact", head: true }).eq("status", "accepted").gte("date", today),
  ]);
  // One request can cover several slots, each its own row
  return new Set((requests.data ?? []).map((r) => r.group_id)).size + (exchanges.count ?? 0);
});

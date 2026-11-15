import { IconArchive, IconX } from "@/components/Icons";
import EmptyState from "@/components/EmptyState";
import SubmitButton from "@/components/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, formatDateTime } from "@/lib/time";
import type { Room } from "@/lib/types";
import { cancelResourceRequest, requestResource } from "../actions";

export type Supply = { id: number; name: string; unit: string; stock: number; active: boolean };
export type ResourceRequest = {
  id: number;
  requester_email: string;
  requester_name: string;
  supply_id: number | null;
  item: string;
  quantity: number;
  needed_on: string;
  room_id: string | null;
  purpose: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string;
  created_at: string;
};

export const RESOURCE_STATUS: Record<ResourceRequest["status"], { label: string; cls: string }> = {
  pending: { label: "Waiting for approval", cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" },
  approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200" },
  declined: { label: "Declined", cls: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200" },
  cancelled: { label: "Withdrawn", cls: "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300" },
};

const BACK = "/equipment#resources";

/**
 * Asking for supplies from stock (markers, cables, batteries) or anything else (a lab, an AV
 * setup) for a date. An admin approves or declines; the faculty member's requests and answers
 * are listed under the form.
 */
export default async function ResourceRequests({ email, rooms, today }: { email: string; rooms: Room[]; today: string }) {
  const supabase = await createClient();
  const [suppliesRes, mineRes] = await Promise.all([
    supabase.from("supplies").select("id, name, unit, stock, active").eq("active", true).order("name"),
    supabase.from("resource_requests").select("*").eq("requester_email", email).order("id", { ascending: false }).limit(20),
  ]);
  if (suppliesRes.error) {
    return (
      <section id="resources" className="card muted scroll-mt-4 p-4 text-sm">
        Resource requests aren&apos;t set up yet. An admin needs to run supabase/migrations/0028_calendar_resources.sql.
      </section>
    );
  }
  const supplies = (suppliesRes.data ?? []) as Supply[];
  const mine = (mineRes.data ?? []) as ResourceRequest[];

  return (
    <section id="resources" className="scroll-mt-4 space-y-3">
      <div>
        <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
          <IconArchive className="h-5 w-5 text-brand-500" /> Request supplies or other resources
        </h2>
        <p className="muted text-sm">
          For anything that needs an admin&apos;s OK: supplies from the department stock, a lab, an AV setup or anything else. You&apos;ll see the answer below.
        </p>
      </div>
      <form action={requestResource} className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_6rem_10rem_minmax(0,1fr)]">
        <input type="hidden" name="back" value={BACK} />
        <div>
          <label className="label" htmlFor="rr-supply">From stock</label>
          <select id="rr-supply" name="supply" className="input" defaultValue="">
            <option value="">Something else (describe it)</option>
            {supplies.map((s) => (
              <option key={s.id} value={s.id} disabled={s.stock === 0}>
                {s.name} · {s.stock === 0 ? "out of stock" : `${s.stock} ${s.unit} left`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="rr-item">Or describe it</label>
          <input id="rr-item" name="item" maxLength={80} className="input" placeholder="e.g. Lab 2 with 30 systems" />
        </div>
        <div>
          <label className="label" htmlFor="rr-qty">How many</label>
          <input id="rr-qty" name="qty" type="number" min={1} max={1000} defaultValue={1} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="rr-date">Needed on</label>
          <input id="rr-date" name="date" type="date" required min={today} max={addDays(today, 60)} defaultValue={today} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="rr-room">Room (optional)</label>
          <select id="rr-room" name="room" className="input" defaultValue="">
            <option value="">No room</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="label" htmlFor="rr-purpose">What it&apos;s for <span className="text-red-600">*</span></label>
          <input id="rr-purpose" name="purpose" required minLength={5} maxLength={300} className="input" placeholder="e.g. ML lab for 5A, unit 3 practicals" />
        </div>
        <div className="flex items-end justify-end">
          <SubmitButton pendingText="Sending…" message="Sending the request…">
            Send request
          </SubmitButton>
        </div>
      </form>

      {mine.length === 0 ? (
        <EmptyState icon={<IconArchive />} title="No resource requests yet">Requests you send show here with the admin&apos;s answer.</EmptyState>
      ) : (
        <ul className="card divide-y divide-brand-100 dark:divide-brand-900">
          {mine.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {r.quantity > 1 ? `${r.quantity} × ` : ""}
                  {r.item}
                </span>
                <span className="muted">
                  {" "}
                  · {formatDate(r.needed_on, { year: undefined })}
                  {r.room_id && ` · ${r.room_id}`} · {r.purpose}
                </span>
                {r.decision_note && <span className="mt-0.5 block text-xs">Admin&apos;s note: {r.decision_note}</span>}
                {r.decided_at && r.status !== "cancelled" && <span className="muted block text-xs">{formatDateTime(r.decided_at)}</span>}
              </span>
              <span className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RESOURCE_STATUS[r.status].cls}`}>{RESOURCE_STATUS[r.status].label}</span>
                {r.status === "pending" && (
                  <form action={cancelResourceRequest}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="back" value={BACK} />
                    <SubmitButton className="btn-secondary py-1 text-xs" pendingText="Withdrawing…" message="Withdrawing the request…" confirm="Withdraw this request?">
                      <IconX className="h-3.5 w-3.5" /> Withdraw
                    </SubmitButton>
                  </form>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

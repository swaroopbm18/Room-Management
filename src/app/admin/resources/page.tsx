import { IconArchive, IconCheck, IconPlus, IconX } from "@/components/Icons";
import EmptyState from "@/components/EmptyState";
import KpiCard from "@/components/KpiCard";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, formatDateTime, todayIST } from "@/lib/time";
import { approveResource, declineResource, saveSupply } from "../../actions";
import { RESOURCE_STATUS, type ResourceRequest, type Supply } from "../../equipment/ResourceRequests";

export const dynamic = "force-dynamic";

const BACK = "/admin/resources";
/** Stock at or under this is flagged as running low. */
const LOW = 5;

/** Resource requests to approve or decline, recent decisions, and the supplies kept in stock. */
export default async function Resources() {
  const today = todayIST();
  const supabase = await createClient();
  const [pendingRes, recentRes, suppliesRes] = await Promise.all([
    supabase.from("resource_requests").select("*").eq("status", "pending").order("needed_on").order("id"),
    supabase.from("resource_requests").select("*").neq("status", "pending").gte("created_at", addDays(today, -30)).order("decided_at", { ascending: false }).limit(30),
    supabase.from("supplies").select("id, name, unit, stock, active").order("name"),
  ]);
  if (suppliesRes.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Resource requests" subtitle="Supplies and other resources faculty ask for." />
        <div className="card muted p-4 text-sm">Run supabase/migrations/0028_calendar_resources.sql in the Supabase SQL Editor to take resource requests.</div>
      </div>
    );
  }
  const pending = (pendingRes.data ?? []) as ResourceRequest[];
  const recent = (recentRes.data ?? []) as ResourceRequest[];
  const supplies = (suppliesRes.data ?? []) as Supply[];
  const stockOf = new Map(supplies.map((s) => [s.id, s]));
  const low = supplies.filter((s) => s.active && s.stock <= LOW);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Resource requests"
        subtitle="Faculty ask for supplies from stock or anything else (a lab, an AV setup) on the Equipment page. Approve or decline here; approving a supply takes it out of stock."
      />

      <section className="grid grid-cols-3 gap-2 sm:gap-4">
        <KpiCard label="Waiting for you" value={pending.length} hint={pending[0] ? `Next needed ${formatDate(pending[0].needed_on, { year: undefined })}` : "Nothing to decide"} tone="navy" icon={<IconArchive />} />
        <KpiCard label="Items in stock" value={supplies.filter((s) => s.active).length} hint={`${supplies.reduce((n, s) => n + (s.active ? s.stock : 0), 0)} pieces in all`} icon={<IconCheck />} />
        <KpiCard label="Running low" value={low.length} hint={low.length ? low.slice(0, 2).map((s) => s.name).join(", ") : `None at ${LOW} or fewer`} tone="ink" icon={<IconX />} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          To decide <span className="muted text-sm font-normal">· {pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <EmptyState icon={<IconCheck />} title="Nothing waiting">New requests from faculty show here.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {pending.map((r) => {
              const s = r.supply_id ? stockOf.get(r.supply_id) : undefined;
              const short = s && s.stock < r.quantity;
              return (
                <li key={r.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">
                        {r.quantity > 1 ? `${r.quantity} × ` : ""}
                        {r.item}
                        {s && (
                          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${short ? "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200" : "bg-brand-100 text-brand-900 dark:bg-brand-900/60 dark:text-brand-100"}`}>
                            {s.stock} {s.unit} in stock
                          </span>
                        )}
                      </div>
                      <div className="muted text-sm">
                        {r.requester_name} · needed {formatDate(r.needed_on, { weekday: "long", year: undefined })}
                        {r.room_id && ` · ${r.room_id}`} · asked {formatDateTime(r.created_at)}
                      </div>
                      <div className="mt-1 text-sm">{r.purpose}</div>
                    </div>
                  </div>
                  <form action={approveResource} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="back" value={BACK} />
                    <input name="note" maxLength={200} aria-label="Note to the requester" placeholder="Note to them (optional), e.g. Collect from the office" className="input min-w-56 flex-1 py-1.5" />
                    <SubmitButton className="btn-primary py-1.5" pendingText="Approving…" message="Approving…">
                      <IconCheck className="h-4 w-4" /> Approve
                    </SubmitButton>
                    <SubmitButton formAction={declineResource} className="btn-secondary py-1.5" pendingText="Declining…" message="Declining…">
                      <IconX className="h-4 w-4" /> Decline
                    </SubmitButton>
                  </form>
                  {short && <p className="mt-1 text-xs text-red-700 dark:text-red-300">Not enough in stock. Add stock below, or decline.</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Supplies in stock</h2>
        <div className="card divide-y divide-brand-100 dark:divide-brand-900">
          {supplies.map((s) => (
            <form key={s.id} action={saveSupply} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="back" value={BACK} />
              <input name="name" required maxLength={60} defaultValue={s.name} aria-label="Item" className="input min-w-40 flex-1 py-1.5 font-medium" />
              <input name="stock" type="number" min={0} required defaultValue={s.stock} aria-label={`${s.name} in stock`} className={`input w-24 py-1.5 ${s.active && s.stock <= LOW ? "border-red-300 dark:border-red-800" : ""}`} />
              <input name="unit" maxLength={20} defaultValue={s.unit} aria-label="Unit" className="input w-24 py-1.5" />
              <select name="active" defaultValue={s.active ? "on" : "off"} aria-label="Can be requested" className="input w-36 py-1.5">
                <option value="on">Can be asked for</option>
                <option value="off">Hidden</option>
              </select>
              <SubmitButton className="btn-secondary py-1.5" pendingText="Saving…" message={`Saving ${s.name}…`}>
                Save
              </SubmitButton>
            </form>
          ))}
          <form action={saveSupply} className="flex flex-wrap items-center gap-2 px-4 py-3">
            <input type="hidden" name="back" value={BACK} />
            <input name="name" required maxLength={60} aria-label="New item" placeholder="e.g. Whiteboard markers" className="input min-w-40 flex-1 py-1.5" />
            <input name="stock" type="number" min={0} required defaultValue={0} aria-label="In stock" className="input w-24 py-1.5" />
            <input name="unit" maxLength={20} defaultValue="pcs" aria-label="Unit" className="input w-24 py-1.5" />
            <SubmitButton className="btn-primary py-1.5" pendingText="Adding…" message="Adding the item…">
              <IconPlus className="h-4 w-4" /> Add item
            </SubmitButton>
          </form>
        </div>
        <p className="muted text-xs">Set the stock when new supplies come in. Approving a request takes its quantity out of stock; hidden items can&apos;t be asked for.</p>
      </section>

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Decided in the last 30 days</h2>
          <ul className="card divide-y divide-brand-100 text-sm dark:divide-brand-900">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    {r.quantity > 1 ? `${r.quantity} × ` : ""}
                    {r.item}
                  </span>
                  <span className="muted">
                    {" "}
                    · {r.requester_name} · {formatDate(r.needed_on, { year: undefined })}
                    {r.decision_note && ` · ${r.decision_note}`}
                  </span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RESOURCE_STATUS[r.status].cls}`}>{RESOURCE_STATUS[r.status].label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

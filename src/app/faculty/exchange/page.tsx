import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import SubmitButton from "@/components/SubmitButton";
import ExchangeStatus from "@/components/ExchangeStatus";
import { IconArrowRight, IconSwap } from "@/components/Icons";
import { requireStaff } from "@/lib/auth";
import { getHolidays, getMySchedule, getSlots } from "@/lib/data";
import { exchangeCandidates, getMyExchanges, isOpenStage, stageOf } from "@/lib/exchanges";
import { DATE_RE, formatDate, slotStarted } from "@/lib/time";
import { requestExchange } from "../../actions";
import ExchangePicker from "./ExchangePicker";

export const dynamic = "force-dynamic";

type Search = { room?: string; date?: string; slot?: string };

export default async function ExchangePage({ searchParams }: { searchParams: Promise<Search> }) {
  const person = await requireStaff();
  const sp = await searchParams;
  await getHolidays();
  const date = DATE_RE.test(sp.date ?? "") ? sp.date! : "";
  const slotId = Number(sp.slot);
  const [slots, mine, exchanges] = await Promise.all([getSlots(), date ? getMySchedule(date, date, [date]) : [], getMyExchanges(person.email)]);
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const slot = slotById.get(slotId);
  const cls = mine.find((r) => r.room_id === sp.room && r.slot_id === slotId);
  const back = (
    <Link href="/faculty" className="btn-secondary">
      Back to my dashboard
    </Link>
  );

  if (!date || !slot || !cls || slotStarted(date, slot)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Class exchange" subtitle="Ask a free colleague to take one of your classes.">{back}</PageHeader>
        <div className="card muted p-6 text-sm">
          {cls && slot && slotStarted(date, slot) ? "This class has already started, so it can't be exchanged." : "That class isn't one of yours, or it has moved. Pick a class from My upcoming classes on your dashboard."}
        </div>
      </div>
    );
  }

  const open = exchanges?.sent.find((x) => x.room_id === cls.room_id && x.date === date && x.slot_id === slotId && isOpenStage(stageOf(x, slotById)));
  const { section, sameClass, others, ready } = await exchangeCandidates(date, slotId, cls.subject, person.initials);

  return (
    <div className="space-y-6">
      <PageHeader title="Class exchange" subtitle="Ask a free colleague to take this class. They accept or decline, then an admin gives the final approval and the timetable changes for everyone.">
        {back}
      </PageHeader>

      <section className="rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-5 text-white shadow-lg shadow-brand-900/20">
        <div className="text-xs font-medium tracking-wide text-brand-200 uppercase">Class to hand over</div>
        <div className="mt-1 text-2xl font-semibold">{cls.subject ?? "Class"}</div>
        <div className="mt-1 text-sm text-brand-100">
          {formatDate(date)} · {slot.label} · Room {cls.room_name}
          {section && <> · Class {section}</>}
        </div>
        <ol className="mt-4 flex flex-wrap items-center gap-2 text-xs text-brand-100">
          <li className="rounded-full bg-white/15 px-2.5 py-1">1. You ask a free colleague</li>
          <IconArrowRight className="h-3.5 w-3.5 opacity-70" />
          <li className="rounded-full bg-white/15 px-2.5 py-1">2. They accept</li>
          <IconArrowRight className="h-3.5 w-3.5 opacity-70" />
          <li className="rounded-full bg-white/15 px-2.5 py-1">3. Admin approves, timetable updates</li>
        </ol>
      </section>

      {exchanges === null && <div className="card p-4 text-sm">Run supabase/migrations/0029_class_exchanges.sql in the Supabase SQL Editor to turn on class exchanges.</div>}

      {open ? (
        <section className="card space-y-3 p-5">
          <h2 className="font-semibold">You&apos;ve already asked {open.target_name}</h2>
          <ExchangeStatus x={open} stage={stageOf(open, slotById)} />
          <p className="muted text-sm">
            To ask someone else, withdraw this request under{" "}
            <Link href="/faculty?tab=requests" className="font-medium text-brand-600 underline dark:text-brand-400">
              My requests
            </Link>{" "}
            first.
          </p>
        </section>
      ) : !ready ? (
        <div className="card muted p-6 text-sm">Faculty availability can&apos;t be read for that day.</div>
      ) : (
        <form action={requestExchange} className="card space-y-5 p-5">
          <input type="hidden" name="room" value={cls.room_id} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="slot" value={slotId} />
          <input type="hidden" name="back" value={`/faculty/exchange?room=${encodeURIComponent(cls.room_id)}&date=${date}&slot=${slotId}`} />
          <ExchangePicker classLabel={section} sameClass={sameClass} others={others} />
          <div>
            <label className="label" htmlFor="ex-note">
              Note to them <span className="muted font-normal">(optional)</span>
            </label>
            <textarea id="ex-note" name="note" rows={2} maxLength={300} placeholder="e.g. I'm at a BoS meeting. Unit 3 notes are on the shared drive." className="input" />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="muted text-xs">They see it under Exchange requests on their dashboard; admins see it straight away too.</span>
            <SubmitButton pendingText="Sending…" message="Sending your exchange request…">
              <IconSwap className="h-4 w-4" /> Send request
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}

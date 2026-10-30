import PageHeader from "@/components/PageHeader";
import PrintButton from "@/components/PrintButton";
import QrCode from "@/components/QrCode";
import { getRooms } from "@/lib/data";
import { roomSummary } from "@/lib/rooms";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/** One A4 poster per room, to stick on its door: scanning it opens the room's live week. */
export default async function RoomPosters() {
  const rooms = await getRooms();
  const base = SITE_URL.replace(/\/$/, "");
  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader title="Room QR posters" subtitle="One page per room. Print them and stick each on its room's door: scanning the code opens that room's timetable for the week, with free slots.">
          <PrintButton label="Print all posters" className="btn-primary" />
        </PageHeader>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 print:block">
        {rooms.map((r) => (
          <section
            key={r.id}
            className="card flex flex-col items-center gap-4 p-8 text-center text-black print:flex print:h-[180mm] print:break-after-page print:justify-center print:rounded-none print:border-0 print:shadow-none dark:text-white print:dark:text-black"
          >
            <div className="text-xs font-semibold tracking-[0.2em] text-brand-600 uppercase print:text-sm">BMSCE · Department of Machine Learning</div>
            <div className="text-5xl font-bold tracking-tight print:text-8xl">Room {r.name}</div>
            {roomSummary(r) && <div className="muted text-sm print:text-xl">{roomSummary(r)}</div>}
            <QrCode text={`${base}/room/${encodeURIComponent(r.id)}`} className="w-48 rounded-lg print:w-[95mm]" />
            <div className="text-lg font-medium print:text-3xl">Scan for this room&apos;s timetable</div>
            <div className="muted text-xs break-all print:text-base">
              {base.replace(/^https?:\/\//, "")}/room/{r.id}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

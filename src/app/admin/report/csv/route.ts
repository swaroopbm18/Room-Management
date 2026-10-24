import type { NextRequest } from "next/server";
import { getPerson } from "@/lib/auth";
import { getSlots } from "@/lib/data";
import { getReport, reportCsv } from "@/lib/report";
import { DATE_RE, todayIST } from "@/lib/time";

export async function GET(request: NextRequest) {
  const person = await getPerson();
  if (person?.role !== "admin") return new Response("Admins only", { status: 403 });
  const sp = request.nextUrl.searchParams;
  const today = todayIST();
  const start = DATE_RE.test(sp.get("start") ?? "") ? sp.get("start")! : today;
  const end = DATE_RE.test(sp.get("end") ?? "") ? sp.get("end")! : today;
  const slots = await getSlots();
  const entries = await getReport(start, end, Number(sp.get("from") ?? slots[0].id), Number(sp.get("to") ?? slots.at(-1)!.id));
  return new Response(reportCsv(entries), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="room-report-${start}-to-${end}.csv"`,
    },
  });
}

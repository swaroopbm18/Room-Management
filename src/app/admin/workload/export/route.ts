import { getPerson } from "@/lib/auth";
import { todayIST } from "@/lib/time";
import { getWorkload, workloadRows } from "@/lib/workload";
import { buildXlsx } from "@/lib/xlsx";

export const dynamic = "force-dynamic";

/** The workload table as an Excel file, for admins. */
export async function GET() {
  const person = await getPerson().catch(() => null);
  if (person?.role !== "admin") return new Response("Admins only", { status: 403 });
  const file = buildXlsx("Workload", workloadRows(await getWorkload()), [28, 9, 11, 14, 13, 11, 11, 10, 10, 12, 10, 10, 10, 50]);
  return new Response(Buffer.from(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="faculty-workload-${todayIST()}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

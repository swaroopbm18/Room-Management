import { getPerson } from "@/lib/auth";
import { buildXlsx } from "@/lib/xlsx";

export const dynamic = "force-dynamic";

/** An Excel sheet to fill in and upload under Calendar & notices → Holidays. */
export async function GET() {
  const person = await getPerson().catch(() => null);
  if (person?.role !== "admin") return new Response("Admins only", { status: 403 });
  const file = buildXlsx(
    "Holidays",
    [
      ["Date", "Name", "Make-up day"],
      ["25/12/2026", "Christmas", "No"],
      ["15/01/2027", "Makara Sankranti", "Yes"],
      ["26/01/2027", "Republic Day", "No"],
    ],
    [14, 32, 14],
  );
  return new Response(Buffer.from(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="holidays-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}

import Manual, { type ManualPart, type ManualQuickStart, type ManualTerm } from "@/components/Manual";
import { requireStaff } from "@/lib/auth";
import * as admin from "@/lib/manual/admin";
import * as faculty from "@/lib/manual/faculty";

export const metadata = { title: "Help", robots: { index: false } };

/** The admin chapters get their own ids ("admin-…"), since some share a name with a faculty one. */
const adminId = (id: string) => `admin-${id}`;
const ADMIN_PARTS: ManualPart[] = admin.PARTS.map((p) => ({
  ...p,
  id: adminId(p.id),
  title: `For admins: ${p.title}`,
  sections: p.sections.map((s) => ({ ...s, id: adminId(s.id) })),
}));
const ADMIN_QUICK_START: ManualQuickStart[] = admin.QUICK_START.map((q) => ({ ...q, href: q.href.startsWith("#") ? `#${adminId(q.href.slice(1))}` : q.href }));

/** Both glossaries, a word defined in both kept once (the admin wording, which covers more). */
function glossary(withAdmin: boolean): ManualTerm[] {
  const terms = new Map<string, ManualTerm>();
  for (const t of [...faculty.GLOSSARY, ...(withAdmin ? admin.GLOSSARY : [])]) terms.set(t.term.toLowerCase(), t);
  return [...terms.values()].sort((a, b) => a.term.localeCompare(b.term));
}

/** One manual for everyone signed in: the faculty chapters, then the admin chapters for admins. */
export default async function Help() {
  const person = await requireStaff();
  const isAdmin = person.role === "admin";
  return (
    <Manual
      title="Help"
      subtitle={
        isAdmin
          ? "Everything on the site, task by task: first what every faculty member can do, then the admin chapters (requests, rooms, timetables, faculty and records)."
          : "Everything a faculty member can do on the site: read the timetable, request a room, hand over or drop a class, answer a colleague, and keep your classes in your calendar."
      }
      quickStart={isAdmin ? [...ADMIN_QUICK_START, ...faculty.QUICK_START] : faculty.QUICK_START}
      parts={isAdmin ? [...faculty.PARTS, ...ADMIN_PARTS] : faculty.PARTS}
      faq={isAdmin ? [...faculty.FAQ, ...admin.FAQ] : faculty.FAQ}
      glossary={glossary(isAdmin)}
    />
  );
}

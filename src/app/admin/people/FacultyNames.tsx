import SubmitButton from "@/components/SubmitButton";
import { IconAlert, IconPlus, IconX } from "@/components/Icons";
import { removeFaculty, saveFaculty } from "../../actions";

export type DirectoryEntry = { initials: string; title: string; full_name: string };

const TITLES = ["Prof.", "Dr.", "Mr.", "Ms.", "Mrs.", ""];

function TitleSelect({ value }: { value: string }) {
  return (
    <select name="title" defaultValue={value} aria-label="Title" className="input w-24 py-1.5">
      {TITLES.map((t) => (
        <option key={t} value={t}>
          {t || "No title"}
        </option>
      ))}
    </select>
  );
}

/**
 * Every faculty member the timetable knows by initials, with the name shown for them.
 * Admins name the ones that show only as initials, fix a name or title, or change initials.
 */
export default function FacultyNames({ directory, inTimetable, owner }: { directory: DirectoryEntry[]; inTimetable: Set<string>; owner: Map<string, string> }) {
  const byIni = new Map(directory.map((d) => [d.initials, d]));
  // Initials in the timetable with no directory entry are listed too, so they can be named
  for (const ini of inTimetable) if (!byIni.has(ini)) byIni.set(ini, { initials: ini, title: "Prof.", full_name: "" });
  const rows = [...byIni.values()].sort((a, b) => Number(!!a.full_name.trim()) - Number(!!b.full_name.trim()) || a.initials.localeCompare(b.initials));
  const unnamed = rows.filter((r) => !r.full_name.trim()).length;
  const listed = new Set(directory.map((d) => d.initials));
  const row = (r: DirectoryEntry) => {
    const named = !!r.full_name.trim();
    return (
      <form
        key={r.initials}
        action={saveFaculty}
        className={`flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4 ${named ? "" : "bg-amber-50/70 dark:bg-amber-950/20"}`}
      >
        <input type="hidden" name="old_initials" value={listed.has(r.initials) ? r.initials : ""} />
        <input
          name="initials"
          defaultValue={r.initials}
          required
          maxLength={10}
          aria-label={`Initials for ${r.initials}`}
          className="input w-24 py-1.5 font-mono text-sm uppercase"
        />
        <TitleSelect value={r.title} />
        <input
          name="full_name"
          defaultValue={r.full_name}
          maxLength={80}
          placeholder="Full name, e.g. Anil Kumar N"
          aria-label={`Name for ${r.initials}`}
          className="input min-w-44 flex-1 py-1.5"
        />
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {!named && <span className="rounded-full bg-amber-200 px-2 py-0.5 font-medium text-amber-950 dark:bg-amber-900 dark:text-amber-100">Only initials shown</span>}
          {!inTimetable.has(r.initials) && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">Not in the timetable</span>}
          {owner.has(r.initials) && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-brand-800 dark:bg-brand-900/70 dark:text-brand-100">Signs in as {owner.get(r.initials)}</span>}
        </div>
        <SubmitButton className="btn-primary py-1.5" pendingText="Saving…" message="Saving the faculty member…">
          Save
        </SubmitButton>
        {listed.has(r.initials) && !inTimetable.has(r.initials) && (
          <button formAction={removeFaculty} formNoValidate className="btn-secondary px-2 py-1.5" aria-label={`Remove ${r.initials}`} title="Remove from the directory">
            <IconX className="h-4 w-4" />
          </button>
        )}
      </form>
    );
  };
  const list = (items: DirectoryEntry[]) => <div className="card divide-y divide-brand-100 overflow-hidden dark:divide-brand-900">{items.map(row)}</div>;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Faculty names and initials</h2>
          <p className="muted text-sm">
            Every faculty member in the timetable and the faculty list ({rows.length}). The name here is shown wherever the timetable uses their initials,
            until they sign in. Initials must match how the timetable writes them.
          </p>
        </div>
        {unnamed > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <IconAlert className="h-3.5 w-3.5" /> {unnamed} show only initials
          </span>
        )}
      </div>

      {unnamed > 0 && list(rows.filter((r) => !r.full_name.trim()))}
      <details className="group" open={unnamed === 0}>
        <summary className="cursor-pointer list-none text-sm font-medium text-brand-600 hover:underline dark:text-brand-400 [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Show all {rows.length - unnamed} named faculty to rename or change initials</span>
          <span className="hidden group-open:inline">Named faculty · {rows.length - unnamed}</span>
        </summary>
        <div className="mt-2">{list(rows.filter((r) => r.full_name.trim()))}</div>
      </details>

      <form action={saveFaculty} className="card flex flex-wrap items-center gap-2 p-3 sm:p-4">
        <span className="w-full text-sm font-medium sm:w-auto">Add a faculty member</span>
        <input name="initials" required maxLength={10} placeholder="Initials" aria-label="Initials" className="input w-24 py-1.5 font-mono text-sm uppercase" />
        <TitleSelect value="Prof." />
        <input name="full_name" maxLength={80} placeholder="Full name" aria-label="Full name" className="input min-w-44 flex-1 py-1.5" />
        <SubmitButton className="btn-secondary py-1.5" pendingText="Adding…" message="Adding the faculty member…">
          <IconPlus className="h-4 w-4" /> Add
        </SubmitButton>
      </form>
    </section>
  );
}

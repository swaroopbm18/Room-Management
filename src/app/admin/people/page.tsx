import SubmitButton from "@/components/SubmitButton";
import Flash from "@/components/Flash";
import { IconPlus, IconUpload } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/auth";
import type { Person } from "@/lib/types";
import { importPeople, upsertPerson } from "../../actions";

export const dynamic = "force-dynamic";

/** Pass `role` to fix the role (the add forms); otherwise it can be changed. */
function PersonFields({ p, role }: { p?: Person; role?: Person["role"] }) {
  return (
    <>
      <input name="email" type="email" required defaultValue={p?.email} readOnly={!!p} placeholder="name@bmsce.ac.in" pattern=".+@bmsce\.ac\.in" className="input w-auto min-w-52 flex-[2] read-only:opacity-70" />
      <input name="full_name" required defaultValue={p?.full_name} placeholder="Full name" className="input w-auto min-w-40 flex-[2]" />
      <input name="title" defaultValue={p?.title ?? ""} placeholder="Prof. / Dr." className="input w-24 shrink-0" />
      <input name="initials" defaultValue={p?.initials ?? ""} placeholder="Initials (AKN)" className="input w-32 shrink-0" />
      {role ? (
        <input type="hidden" name="role" value={role} />
      ) : (
        <select name="role" defaultValue={p?.role ?? "faculty"} className="input w-28 shrink-0">
          <option value="faculty">Faculty</option>
          <option value="admin">Admin</option>
        </select>
      )}
      <select name="active" defaultValue={p ? String(p.active) : "true"} className="input w-28 shrink-0">
        <option value="true">Active</option>
        <option value="false">No access</option>
      </select>
    </>
  );
}

function AddPerson({ role }: { role: Person["role"] }) {
  const label = role === "admin" ? "admin" : "faculty";
  return (
    <section className="card p-5">
      <h2 className="mb-3 font-semibold">Add {label}</h2>
      <form action={upsertPerson} className="flex flex-wrap gap-2">
        <PersonFields role={role} />
        <SubmitButton pendingText="Adding…" message={`Adding the ${label}…`}>
          <IconPlus className="h-4 w-4" /> Add {label}
        </SubmitButton>
      </form>
    </section>
  );
}

/** One group of people; click a person to edit them. */
function PeopleList({ title, people, empty }: { title: string; people: Person[]; empty: string }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">
        {title} <span className="muted text-sm font-normal">· {people.length}</span>
      </h2>
      <div className="card divide-y divide-brand-100 dark:divide-brand-900">
        {people.length === 0 && <p className="muted px-4 py-3 text-sm">{empty}</p>}
        {people.map((p) => (
          <details key={p.email} className={`group ${p.active ? "" : "opacity-60"}`}>
            <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-brand-50 sm:grid-cols-[minmax(0,2fr)_6rem_minmax(0,2fr)_6rem_3rem] dark:hover:bg-brand-950 [&::-webkit-details-marker]:hidden">
              <span className="font-medium">{displayName(p)}</span>
              <span className="muted hidden text-sm sm:block">{p.initials ?? "—"}</span>
              <span className="muted hidden truncate text-sm sm:block">{p.email}</span>
              <span className="muted hidden text-sm sm:block">{p.active ? "Active" : "No access"}</span>
              <span className="text-right text-sm font-medium text-brand-600 dark:text-brand-400">
                <span className="group-open:hidden">Edit</span>
                <span className="hidden group-open:inline">Close</span>
              </span>
              <span className="muted col-span-2 text-xs sm:hidden">
                {p.initials ?? "No initials"} · {p.email}
                {p.active ? "" : " · No access"}
              </span>
            </summary>
            <form action={upsertPerson} className="flex flex-wrap items-center gap-2 border-t border-brand-100 bg-brand-50/50 p-3 dark:border-brand-900 dark:bg-brand-950/40">
              <PersonFields p={p} />
              <SubmitButton className="btn-secondary py-1.5" pendingText="Saving…" message="Saving changes…">
                Save
              </SubmitButton>
            </form>
          </details>
        ))}
      </div>
    </section>
  );
}

export default async function People({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("people").select("*").order("role").order("full_name");
  const people = (data ?? []) as Person[];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Faculty & admins"
        subtitle={`${people.filter((p) => p.active).length} people can sign in. Initials link each person to their classes in the timetable.`}
      />
      <Flash msg={sp.msg} error={sp.error} />

      <PeopleList title="Admins" people={people.filter((p) => p.role === "admin")} empty="No admins yet." />
      <AddPerson role="admin" />

      <PeopleList title="Faculty" people={people.filter((p) => p.role === "faculty")} empty="No faculty yet." />
      <AddPerson role="faculty" />

      <section className="card p-5">
        <h2 className="font-semibold">Import a list</h2>
        <p className="muted mt-1 mb-3 text-sm">
          One person per line: <code>email, full name, initials, title, role</code>. Existing people are updated.
          Rows pasted straight from faculty-list.csv (<code>Dr. AKN, full name, email, role</code>) work too.
        </p>
        <form action={importPeople} className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-brand-300 p-4 dark:border-brand-800">
            <label htmlFor="file" className="text-sm font-medium">Upload a CSV file</label>
            <input
              id="file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700 dark:file:bg-brand-500 dark:file:text-black"
            />
            <a href="/people-template.csv" download className="text-xs text-brand-600 underline dark:text-brand-400">
              Download a template
            </a>
          </div>
          <div className="muted text-xs">or paste rows below</div>
          <textarea name="csv" rows={5} className="input font-mono text-xs" placeholder={"akn@bmsce.ac.in, Anil Kumar N, AKN, Dr., faculty\nhod.ml@bmsce.ac.in, Head of Department, , Dr., admin"} />
          <SubmitButton className="btn-secondary" pendingText="Importing…" message="Importing the list. This can take a few seconds…">
            <IconUpload className="h-4 w-4" /> Import
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}

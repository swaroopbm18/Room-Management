import Flash from "@/components/Flash";
import { IconPlus, IconUpload } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";
import { importPeople, upsertPerson } from "../../actions";

export const dynamic = "force-dynamic";

function PersonFields({ p }: { p?: Person }) {
  return (
    <>
      <input name="email" type="email" required defaultValue={p?.email} readOnly={!!p} placeholder="name@bmsce.ac.in" pattern=".+@bmsce\.ac\.in" className="input min-w-52 read-only:opacity-70" />
      <input name="full_name" required defaultValue={p?.full_name} placeholder="Full name" className="input min-w-40" />
      <input name="title" defaultValue={p?.title ?? ""} placeholder="Prof. / Dr." className="input w-24" />
      <input name="initials" defaultValue={p?.initials ?? ""} placeholder="Initials (AKN)" className="input w-32" />
      <select name="role" defaultValue={p?.role ?? "faculty"} className="input w-28">
        <option value="faculty">Faculty</option>
        <option value="admin">Admin</option>
      </select>
      <select name="active" defaultValue={p ? String(p.active) : "true"} className="input w-28">
        <option value="true">Active</option>
        <option value="false">No access</option>
      </select>
    </>
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

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Add a person</h2>
        <form action={upsertPerson} className="flex flex-wrap gap-2">
          <PersonFields />
          <button className="btn-primary">
            <IconPlus className="h-4 w-4" /> Add
          </button>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Import a list</h2>
        <p className="muted mt-1 mb-3 text-sm">
          One person per line: <code>email, full name, initials, title, role</code>. Existing people are updated.
          Rows pasted straight from faculty-list.csv (<code>Dr. AKN, full name, email, role</code>) work too.
        </p>
        <form action={importPeople} className="space-y-3">
          <textarea name="csv" rows={5} className="input font-mono text-xs" placeholder={"akn@bmsce.ac.in, Anil Kumar N, AKN, Dr., faculty\nhod.ml@bmsce.ac.in, Head of Department, , Dr., admin"} />
          <button className="btn-secondary">
            <IconUpload className="h-4 w-4" /> Import
          </button>
        </form>
      </section>

      <section className="card divide-y divide-brand-100 dark:divide-brand-900">
        {people.map((p) => (
          <form key={p.email} action={upsertPerson} className={`flex flex-wrap items-center gap-2 p-3 ${p.active ? "" : "opacity-60"}`}>
            <PersonFields p={p} />
            <button className="btn-secondary py-1.5">Save</button>
          </form>
        ))}
      </section>
    </div>
  );
}

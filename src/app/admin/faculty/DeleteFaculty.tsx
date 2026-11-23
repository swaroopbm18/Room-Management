"use client";

import { useState } from "react";
import SubmitButton from "@/components/SubmitButton";
import { IconTrash } from "@/components/Icons";
import { purgeFaculty } from "../../actions";

type Member = { initials: string; name: string };

/**
 * Deletes a faculty record even while the timetable uses it. Picking someone merges the record
 * into them (for a typo such as LKB for LBK); leaving it empty takes them off their classes.
 */
export default function DeleteFaculty({
  person,
  email,
  classes,
  others,
  back,
  done,
}: {
  person: Member;
  email?: string;
  classes: number;
  others: Member[];
  back: string;
  done: string;
}) {
  const [into, setInto] = useState("");
  const target = into.trim().toUpperCase();
  const known = others.find((o) => o.initials === target);
  const slots = `${classes} class slot${classes === 1 ? "" : "s"}`;
  const confirm = target
    ? `Merge ${person.initials} into ${known ? `${known.name} (${target})` : target}? ` +
      (classes ? `${person.initials}'s ${slots} ${classes === 1 ? "goes" : "go"} to ${target} from tomorrow, ` : "") +
      `with their duties, cluster and leave${email ? `, and ${email} signs in as ${target}` : ""}. ` +
      `${person.initials} is removed, and a timetable upload that still says ${person.initials} is read as ${target}.`
    : `Delete ${person.name} (${person.initials})? ` +
      (classes ? `They are taken off their ${slots} from tomorrow; the classes stay, with no faculty named unless someone else teaches them too. ` : "") +
      `Their name, cluster, duties and leave go${email ? `, and ${email} can no longer sign in` : ""}. Earlier days keep what was recorded. This can't be undone.`;

  return (
    <div id="delete" className="scroll-mt-4 rounded-xl border border-red-200 bg-white p-4 md:col-span-2 dark:border-red-900/60 dark:bg-ink">
      <form action={purgeFaculty} className="space-y-3">
        <input type="hidden" name="initials" value={person.initials} />
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="done" value={done} />
        <div>
          <h3 className="font-semibold">Delete or merge {person.initials}</h3>
          <p className="muted mt-0.5 text-xs">
            {classes > 0
              ? `${person.initials} has ${slots} in the timetable from tomorrow. If ${person.initials} is a typo for someone, pick them and everything moves to them. Leave it empty to take ${person.initials} off those classes and delete them.`
              : `Removes ${person.initials} from the faculty list with their name, cluster and duties${email ? ", subjects and sign-in. Past requests stay in the history" : ""}. Pick someone to merge ${person.initials} into them instead.`}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <label className="label" htmlFor="merge-into">Give their classes and duties to</label>
            <input
              id="merge-into"
              name="into"
              list="merge-into-list"
              value={into}
              onChange={(e) => setInto(e.target.value.toUpperCase())}
              maxLength={10}
              autoComplete="off"
              placeholder="Nobody, just delete"
              className="input py-1.5 font-mono uppercase"
            />
            <datalist id="merge-into-list">
              {others.map((o) => (
                <option key={o.initials} value={o.initials}>
                  {o.name}
                </option>
              ))}
            </datalist>
          </div>
          <SubmitButton
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
            pendingText={target ? "Merging…" : "Deleting…"}
            message={target ? `Merging ${person.initials} into ${target}…` : `Deleting ${person.initials}…`}
            confirm={confirm}
            confirmLabel={target ? "Merge" : "Delete"}
          >
            <IconTrash className="h-4 w-4" /> {target ? `Merge into ${target}` : `Delete ${person.initials}`}
          </SubmitButton>
        </div>
        {target && !known && <p className="text-xs text-amber-700 dark:text-amber-300">{target} isn&apos;t on the faculty list yet. {person.initials} will simply be renamed to {target}.</p>}
      </form>
    </div>
  );
}

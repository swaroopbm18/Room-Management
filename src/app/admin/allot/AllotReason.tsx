"use client";

import { useEffect, useRef, useState } from "react";
import FacultyPicker, { type PickFaculty } from "@/components/FacultyPicker";

type Kind = "cie" | "see" | "event" | "class_request";

const TITLE_HINT: Record<Kind, string> = {
  cie: "e.g. CIE-2 DBMS, 3rd sem",
  see: "e.g. DBMS, 3rd sem",
  event: "e.g. IEEE workshop on GenAI",
  class_request: "e.g. DBMS-3B extra class",
};

const DESCRIPTION_HINT: Record<Kind, string> = {
  cie: "Shown on the timetable",
  see: "Shown on the timetable",
  event: "Shown on the timetable",
  class_request: "e.g. Faculty assigned for the extra class, or no faculty assigned yet",
};

/**
 * The reason for an allotment (CIE, SEE, event or class), its title and description. A class names
 * the faculty member who takes it; an event, CIE or SEE can name several, a cluster or the whole department.
 */
export default function AllotReason({ faculty }: { faculty: PickFaculty[] }) {
  const [kind, setKind] = useState<Kind>("cie");
  const ref = useRef<HTMLSelectElement>(null);

  // The kind can be filled in from the last allotment on this device after the page loads.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => setKind(el.value as Kind);
    const t = setTimeout(sync, 0);
    el.addEventListener("change", sync);
    return () => {
      clearTimeout(t);
      el.removeEventListener("change", sync);
    };
  }, []);

  return (
    <>
      <div>
        <label className="label" htmlFor="kind">Reason</label>
        <select ref={ref} id="kind" name="kind" className="input" defaultValue="cie">
          <option value="cie">CIE (exam)</option>
          <option value="see">SEE (exam)</option>
          <option value="event">College event</option>
          <option value="class_request">Class</option>
        </select>
      </div>
      {kind !== "class_request" && (
        // Several faculty, a cluster or the whole department; a CIE or SEE with none shows its co-ordinators
        <FacultyPicker key={kind} faculty={faculty} emptyText={kind === "see" ? "SEE Co-ordinators" : kind === "cie" ? "CIE Co-ordinators" : "None"} />
      )}
      {kind === "class_request" && (
        <div>
          <label className="label" htmlFor="faculty">Faculty for the class</label>
          <select id="faculty" name="faculty" className="input" defaultValue="">
            <option value="">No faculty assigned</option>
            {faculty.map((f) => (
              <option key={f.initials} value={f.initials}>
                {f.name === f.initials ? f.initials : `${f.name} (${f.initials})`}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="label" htmlFor="title">{kind === "class_request" ? "Subject" : "Title"}</label>
        <input id="title" name="title" className="input" placeholder={TITLE_HINT[kind]} />
      </div>
      <div className={kind === "class_request" ? "sm:col-span-2 lg:col-span-3" : "sm:col-span-2 lg:col-span-1"}>
        <label className="label" htmlFor="reason">Description <span className="text-red-600">*</span></label>
        <input id="reason" name="reason" required minLength={5} className="input" placeholder={DESCRIPTION_HINT[kind]} />
        {kind === "class_request" && (
          <p className="muted mt-1 text-xs">Say whether a faculty member is assigned to the class. It shows on the timetable, the home page and the report.</p>
        )}
      </div>
    </>
  );
}

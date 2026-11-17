"use client";

import { useEffect, useRef, useState } from "react";

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
 * The reason for an allotment (CIE, event or class), its title and description. A class names
 * the faculty member who takes it, or says no faculty is assigned.
 */
export default function AllotReason({ faculty }: { faculty: { initials: string; name: string }[] }) {
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
      {(kind === "cie" || kind === "see") && (
        <div>
          <span className="label">Faculty</span>
          <p className="input bg-transparent text-sm">{kind === "see" ? "SEE Co-ordinators" : "CIE Co-ordinators"}</p>
        </div>
      )}
      {(kind === "event" || kind === "class_request") && (
        <div>
          <label className="label" htmlFor="faculty">{kind === "event" ? <>Faculty in charge <span className="muted font-normal">(optional)</span></> : "Faculty for the class"}</label>
          <select key={kind} id="faculty" name="faculty" className="input" defaultValue="">
            <option value="">{kind === "event" ? "None" : "No faculty assigned"}</option>
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

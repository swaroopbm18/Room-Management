"use client";

import { useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadingOverlay from "@/components/LoadingOverlay";
import { adminOverride, allotClashes } from "../../actions";

/**
 * The allot form. Before it saves, it checks whether any of the chosen slots is already booked
 * (an event, CIE, class or approved request). If so it asks first; only the chosen slots are
 * replaced, so the rest of an existing booking stays as it was.
 */
export default function AllotForm({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  const overwrite = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [clashes, setClashes] = useState<string[]>([]);

  const submitConfirmed = () => {
    if (overwrite.current) overwrite.current.value = "yes";
    ref.current?.requestSubmit();
  };

  return (
    <form
      ref={ref}
      action={adminOverride}
      className={className}
      onSubmit={async (e) => {
        if (overwrite.current?.value === "yes") {
          // Checked or confirmed: this submit goes ahead, and the next one is checked again
          setTimeout(() => {
            if (overwrite.current) overwrite.current.value = "";
          }, 0);
          return;
        }
        e.preventDefault();
        setChecking(true);
        let found: string[] = [];
        try {
          found = await allotClashes(new FormData(e.currentTarget));
        } catch {
          // Can't check: the server checks again and says if a booking is in the way
        }
        setChecking(false);
        if (found.length) setClashes(found);
        else submitConfirmed();
      }}
    >
      <input ref={overwrite} type="hidden" name="overwrite" defaultValue="" />
      {children}
      {checking && <LoadingOverlay label="Checking the slots…" />}
      <ConfirmDialog
        open={clashes.length > 0}
        message={`Already booked in this room: ${clashes.join("; ")}. Overwrite with the new booking? Only the times you picked change; the rest of the existing booking stays.`}
        confirmLabel="Yes, overwrite"
        onCancel={() => setClashes([])}
        onConfirm={() => {
          setClashes([]);
          submitConfirmed();
        }}
      />
    </form>
  );
}

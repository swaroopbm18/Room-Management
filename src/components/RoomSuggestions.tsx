import Link from "next/link";
import { roomSummary, type RoomSuggestion } from "@/lib/rooms";
import { IconArrowRight, IconDoor } from "./Icons";

/** Other rooms free at the same time, best matches first, each a link to request it. */
export default function RoomSuggestions({ title, hint, items, href }: { title: string; hint?: string; items: RoomSuggestion[]; href: (roomId: string) => string }) {
  if (!items.length) return null;
  return (
    <section className="card p-4">
      <h2 className="inline-flex items-center gap-2 font-semibold">
        <IconDoor className="h-4 w-4" /> {title}
      </h2>
      {hint && <p className="muted mt-0.5 text-xs">{hint}</p>}
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map(({ room, why }) => (
          <li key={room.id}>
            <Link href={href(room.id)} className="group flex items-center justify-between gap-3 rounded-lg border border-brand-100 px-3 py-2 transition hover:border-brand-300 hover:bg-brand-50 dark:border-brand-900 dark:hover:border-brand-700 dark:hover:bg-brand-950">
              <span className="min-w-0">
                <span className="block font-medium">{room.name}</span>
                <span className="muted block truncate text-xs">{roomSummary(room) || "No details yet"}</span>
                {why.length > 0 && <span className="block truncate text-[11px] text-emerald-700 dark:text-emerald-300">Matches: {why.join(", ")}</span>}
              </span>
              <IconArrowRight className="h-4 w-4 shrink-0 text-brand-500 transition group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

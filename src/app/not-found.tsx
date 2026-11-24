import Link from "next/link";
import { IconBuilding } from "@/components/Icons";

/** Shown for a link to a page or room that doesn't exist. */
export default function NotFound() {
  return (
    <section className="card mx-auto flex max-w-xl flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900/70 dark:text-brand-200">
        <IconBuilding className="h-7 w-7" />
      </span>
      <div>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="muted mt-1">The link may be old, or the room may have been renamed or removed.</p>
      </div>
      <Link href="/" className="btn-primary">
        Go to the home page
      </Link>
    </section>
  );
}

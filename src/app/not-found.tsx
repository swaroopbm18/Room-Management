import Link from "next/link";
import AppLogo from "@/components/AppLogo";

/** Shown for a link to a page or room that doesn't exist. */
export default function NotFound() {
  return (
    <section className="card mx-auto flex max-w-xl flex-col items-center gap-4 px-6 py-14 text-center">
      <AppLogo className="h-14 w-14" />
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

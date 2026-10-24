import Spinner from "./Spinner";

/** Shown over the page while new data loads: a progress bar on top and a spinner card. */
export default function LoadingOverlay({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-40 cursor-wait">
      <div className="loading-bar absolute inset-x-0 top-0 h-1 bg-brand-500" />
      <div className="absolute inset-0 bg-brand-50/50 backdrop-blur-[1px] dark:bg-black/50" />
      <div className="absolute top-1/3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-white px-5 py-3 text-sm font-medium text-brand-700 shadow-lg ring-1 ring-brand-100 dark:bg-ink dark:text-brand-300 dark:ring-brand-900">
        <Spinner />
        {label}
      </div>
    </div>
  );
}

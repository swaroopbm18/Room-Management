export default function Flash({ msg, error }: { msg?: string; error?: string }) {
  if (!msg && !error) return null;
  return (
    <div
      role="status"
      className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
        error
          ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
      }`}
    >
      {error ?? msg}
    </div>
  );
}

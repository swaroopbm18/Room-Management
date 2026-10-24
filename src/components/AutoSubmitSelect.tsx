"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import LoadingOverlay from "./LoadingOverlay";

/**
 * A select that updates one query parameter on change. `keep` pins other parameters to the
 * values on screen. With `pathTemplate` (e.g. "/room/{}"), the value goes into the path instead.
 */
export default function AutoSubmitSelect({
  name,
  value,
  options,
  label,
  keep = {},
  pathTemplate,
  className = "",
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  label: string;
  keep?: Record<string, string>;
  pathTemplate?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  // Show the picked option straight away, while the page loads.
  const [shown, setShown] = useOptimistic(value);
  return (
    <label className={`flex items-center gap-2 text-sm ${className}`}>
      <span className="muted whitespace-nowrap">{label}</span>
      <select
        className="input w-auto"
        value={shown}
        disabled={pending}
        onChange={(e) => {
          const picked = e.target.value;
          const next = new URLSearchParams(params.toString());
          for (const [k, v] of Object.entries(keep)) next.set(k, v);
          let path = pathname;
          if (pathTemplate) path = pathTemplate.replace("{}", encodeURIComponent(picked));
          else next.set(name, picked);
          startTransition(() => {
            setShown(picked);
            router.push(`${path}?${next.toString()}`, { scroll: false });
          });
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {pending && <LoadingOverlay />}
    </label>
  );
}

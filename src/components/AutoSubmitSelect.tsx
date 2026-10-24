"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

/** A select that updates one query parameter on change. `keep` pins other parameters to the values on screen. */
export default function AutoSubmitSelect({
  name,
  value,
  options,
  label,
  keep = {},
  className = "",
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  label: string;
  keep?: Record<string, string>;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className={`flex items-center gap-2 text-sm ${className}`}>
      <span className="muted whitespace-nowrap">{label}</span>
      <select
        className="input w-auto"
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          for (const [k, v] of Object.entries(keep)) next.set(k, v);
          next.set(name, e.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

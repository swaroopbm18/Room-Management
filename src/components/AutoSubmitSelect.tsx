"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

/** A select that updates one query parameter on change. */
export default function AutoSubmitSelect({
  name,
  value,
  options,
  label,
  className = "",
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  label: string;
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

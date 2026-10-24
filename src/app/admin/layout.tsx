import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

const TABS = [
  { href: "/admin", label: "Requests" },
  { href: "/admin/allot", label: "Allot for CIE / Event" },
  { href: "/admin/people", label: "Faculty & admins" },
  { href: "/admin/history", label: "History" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-brand-100 p-1 text-sm dark:border-brand-900">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="rounded-lg px-3 py-1.5 font-medium text-brand-800 hover:bg-brand-50 dark:text-brand-200 dark:hover:bg-brand-950">
            {t.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}

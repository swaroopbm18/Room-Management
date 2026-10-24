import Link from "next/link";
import { IconFlag, IconHistory, IconInbox, IconUsers } from "@/components/Icons";
import { requireAdmin } from "@/lib/auth";

const TABS = [
  { href: "/admin", label: "Requests", icon: <IconInbox className="h-4 w-4" /> },
  { href: "/admin/allot", label: "Allot / free rooms", icon: <IconFlag className="h-4 w-4" /> },
  { href: "/admin/people", label: "Faculty & admins", icon: <IconUsers className="h-4 w-4" /> },
  { href: "/admin/history", label: "History", icon: <IconHistory className="h-4 w-4" /> },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-1 rounded-xl bg-brand-950 p-1 text-sm shadow-sm dark:border dark:border-brand-900 dark:bg-ink">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-brand-100 hover:bg-white/10 hover:text-white">
            {t.icon}
            {t.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}

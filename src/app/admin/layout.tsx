import AdminNav from "@/components/AdminNav";
import { requireAdmin } from "@/lib/auth";
import { pendingRequestCount } from "@/lib/pending";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const pending = await pendingRequestCount();
  return (
    <div>
      <AdminNav pending={pending} />
      {children}
    </div>
  );
}

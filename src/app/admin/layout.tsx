import AdminNav from "@/components/AdminNav";
import { requireAdmin } from "@/lib/auth";
import { pendingRequestCount } from "@/lib/pending";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Both at once; the count is shared with the navbar, so it is read once per page
  const [, pending] = await Promise.all([requireAdmin(), pendingRequestCount()]);
  return (
    <div>
      <AdminNav pending={pending} />
      {children}
    </div>
  );
}

import { requireAdmin } from "@/lib/auth";

/** Every admin page needs an admin; the pages themselves are in the side navigation. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return children;
}

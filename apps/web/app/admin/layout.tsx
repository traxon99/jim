import { requireAdminRole } from "@/lib/admin/load-access";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin · Jim",
  robots: { index: false, follow: false },
};

/**
 * The admin console (issue #806). Like the portal (ADR-015) it sits outside
 * the (shell) group: no tab bar, no sync engine, no IndexedDB, and it skips
 * the install gate. Anyone who isn't an admin gets a 404 here, so the area
 * doesn't reveal itself; the (console) layout below also requires TOTP.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdminRole();
  return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
}

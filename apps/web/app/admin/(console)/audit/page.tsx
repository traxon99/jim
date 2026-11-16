import { AdminAuditLog } from "@/components/admin/admin-audit-log";
import { requireAdmin } from "@/lib/admin/load-access";
import { serviceDb } from "@/lib/db/user-scoped";
import { loadAuditLog } from "@jim/db/admin";

export default async function AdminAuditPage() {
  await requireAdmin();
  const rows = await loadAuditLog(serviceDb());
  return <AdminAuditLog rows={rows} />;
}

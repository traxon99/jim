import { AdminAuditLog } from "@/components/admin/admin-audit-log";
import { loadAuditLog } from "@/lib/admin/audit-data";
import { requireAdmin } from "@/lib/admin/load-access";

export default async function AdminAuditPage() {
  await requireAdmin();
  const rows = await loadAuditLog();
  return <AdminAuditLog rows={rows} />;
}

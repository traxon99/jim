import { AdminHealth } from "@/components/admin/admin-health";
import { loadHealth } from "@/lib/admin/health-data";
import { requireAdmin } from "@/lib/admin/load-access";

export default async function AdminHealthPage() {
  await requireAdmin();
  return <AdminHealth health={await loadHealth()} />;
}

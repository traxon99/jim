import { AdminHealth } from "@/components/admin/admin-health";
import { requireAdmin } from "@/lib/admin/load-access";
import { webHealthOptions } from "@/lib/admin/web-health";
import { serviceDb } from "@/lib/db/user-scoped";
import { loadHealth } from "@jim/db/admin";

export default async function AdminHealthPage() {
  await requireAdmin();
  return <AdminHealth health={await loadHealth(serviceDb(), webHealthOptions())} />;
}

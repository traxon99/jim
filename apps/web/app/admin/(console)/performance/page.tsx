import { AdminPerformance } from "@/components/admin/admin-performance";
import { requireAdmin } from "@/lib/admin/load-access";
import { serviceDb } from "@/lib/db/user-scoped";
import { TELEMETRY_RANGES, pickRange } from "@jim/db/admin";
import { loadPerformance } from "@jim/db/admin";

export default async function AdminPerformancePage(props: PageProps<"/admin/performance">) {
  await requireAdmin();
  const range = pickRange(TELEMETRY_RANGES, (await props.searchParams).range, "7d");
  const { all, versions } = await loadPerformance(range, serviceDb());
  return <AdminPerformance range={range} all={all} versions={versions} />;
}

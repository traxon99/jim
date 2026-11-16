import { AdminPerformance } from "@/components/admin/admin-performance";
import { TELEMETRY_RANGES, pickRange } from "@/lib/admin/dashboard";
import { requireAdmin } from "@/lib/admin/load-access";
import { loadPerformance } from "@/lib/admin/performance-data";

export default async function AdminPerformancePage(props: PageProps<"/admin/performance">) {
  await requireAdmin();
  const range = pickRange(TELEMETRY_RANGES, (await props.searchParams).range, "7d");
  const { all, versions } = await loadPerformance(range);
  return <AdminPerformance range={range} all={all} versions={versions} />;
}

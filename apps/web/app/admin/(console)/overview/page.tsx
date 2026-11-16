import { AdminOverview } from "@/components/admin/admin-overview";
import { OVERVIEW_RANGES, TELEMETRY_RANGES, pickRange } from "@/lib/admin/dashboard";
import { loadFailures } from "@/lib/admin/failures-data";
import { countOpenFeedback } from "@/lib/admin/feedback-data";
import { loadSyncLagP50 } from "@/lib/admin/health-data";
import { requireAdmin } from "@/lib/admin/load-access";
import { loadOverview } from "@/lib/admin/overview-data";
import { loadPerformance } from "@/lib/admin/performance-data";

export default async function AdminOverviewPage(props: PageProps<"/admin/overview">) {
  await requireAdmin();
  const range = pickRange(OVERVIEW_RANGES, (await props.searchParams).range, "30d");
  const [data, failures, performance, syncLagP50, openFeedback] = await Promise.all([
    loadOverview(range),
    loadFailures(pickRange(TELEMETRY_RANGES, "24h", "24h"), null),
    loadPerformance(pickRange(TELEMETRY_RANGES, "7d", "7d")),
    loadSyncLagP50(),
    countOpenFeedback(),
  ]);
  return (
    <AdminOverview
      range={range}
      data={data}
      rightNow={{
        failures24h: { events: failures.events, newGroups: failures.newGroups },
        lcpP75: performance.all.metrics.LCP?.p75 ?? null,
        syncLagP50,
        openFeedback,
      }}
    />
  );
}

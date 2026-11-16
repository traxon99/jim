import { AdminOverview } from "@/components/admin/admin-overview";
import { requireAdmin } from "@/lib/admin/load-access";
import { serviceDb } from "@/lib/db/user-scoped";
import { OVERVIEW_RANGES, TELEMETRY_RANGES, pickRange } from "@jim/db/admin";
import { loadFailures } from "@jim/db/admin";
import { countOpenFeedback } from "@jim/db/admin";
import { loadSyncLagP50 } from "@jim/db/admin";
import { loadOverview } from "@jim/db/admin";
import { loadPerformance } from "@jim/db/admin";

export default async function AdminOverviewPage(props: PageProps<"/admin/overview">) {
  await requireAdmin();
  const range = pickRange(OVERVIEW_RANGES, (await props.searchParams).range, "30d");
  const db = serviceDb();
  const [data, failures, performance, syncLagP50, openFeedback] = await Promise.all([
    loadOverview(range, db),
    loadFailures(pickRange(TELEMETRY_RANGES, "24h", "24h"), null, db),
    loadPerformance(pickRange(TELEMETRY_RANGES, "7d", "7d"), db),
    loadSyncLagP50(db),
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

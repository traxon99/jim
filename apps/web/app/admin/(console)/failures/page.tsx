import { AdminFailures } from "@/components/admin/admin-failures";
import { TELEMETRY_RANGES, pickRange } from "@/lib/admin/dashboard";
import { loadFailures, pickFailureSource } from "@/lib/admin/failures-data";
import { requireAdmin } from "@/lib/admin/load-access";

export default async function AdminFailuresPage(props: PageProps<"/admin/failures">) {
  await requireAdmin();
  const searchParams = await props.searchParams;
  const range = pickRange(TELEMETRY_RANGES, searchParams.range, "7d");
  const source = pickFailureSource(searchParams.source);
  const data = await loadFailures(range, source);
  return <AdminFailures range={range} source={source} data={data} />;
}

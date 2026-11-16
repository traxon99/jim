import { AdminFailures } from "@/components/admin/admin-failures";
import { requireAdmin } from "@/lib/admin/load-access";
import { serviceDb } from "@/lib/db/user-scoped";
import { TELEMETRY_RANGES, pickRange } from "@jim/db/admin";
import { loadFailures, pickFailureSource } from "@jim/db/admin";

export default async function AdminFailuresPage(props: PageProps<"/admin/failures">) {
  await requireAdmin();
  const searchParams = await props.searchParams;
  const range = pickRange(TELEMETRY_RANGES, searchParams.range, "7d");
  const source = pickFailureSource(searchParams.source);
  const data = await loadFailures(range, source, serviceDb());
  return <AdminFailures range={range} source={source} data={data} />;
}

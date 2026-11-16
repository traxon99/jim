import { dashboardHref } from "@/components/admin/admin-dashboard-ui";
import { AdminFailureDetail } from "@/components/admin/admin-failure-detail";
import { TELEMETRY_RANGES, pickRange } from "@/lib/admin/dashboard";
import { loadFailureDetail, pickFailureSource } from "@/lib/admin/failures-data";
import { requireAdmin } from "@/lib/admin/load-access";
import { notFound } from "next/navigation";

export default async function AdminFailurePage(props: PageProps<"/admin/failures/[fingerprint]">) {
  await requireAdmin();
  const [{ fingerprint }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const detail = await loadFailureDetail(decodeURIComponent(fingerprint).slice(0, 100));
  if (!detail) notFound();
  const range = pickRange(TELEMETRY_RANGES, searchParams.range, "7d");
  const backHref = dashboardHref("/admin/failures", {
    source: pickFailureSource(searchParams.source),
    range: range.id === "7d" ? null : range.id,
  });
  return <AdminFailureDetail detail={detail} backHref={backHref} />;
}

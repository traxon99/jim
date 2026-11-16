import { AdminFailureDetail } from "@/components/admin/admin-failure-detail";
import { loadFailureDetail } from "@/lib/admin/failures-data";
import { requireAdmin } from "@/lib/admin/load-access";
import { notFound } from "next/navigation";

export default async function AdminFailurePage(props: PageProps<"/admin/failures/[fingerprint]">) {
  await requireAdmin();
  const { fingerprint } = await props.params;
  const detail = await loadFailureDetail(decodeURIComponent(fingerprint).slice(0, 100));
  if (!detail) notFound();
  return <AdminFailureDetail detail={detail} />;
}

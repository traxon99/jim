import { PortalOverview } from "@/components/portal/portal-overview";
import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { loadOverviewData } from "@/lib/portal/load-portal-data";
import { redirect } from "next/navigation";

/** The Analysis Overview (issues #38, #470). The layout carries the nav. */
export default async function PortalOverviewPage() {
  try {
    const data = await loadOverviewData();
    return <PortalOverview data={data} />;
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login?next=/portal");
    throw error;
  }
}

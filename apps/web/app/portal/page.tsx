import { PortalDashboard } from "@/components/portal/portal-dashboard";
import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { loadPortalData } from "@/lib/portal/load-portal-data";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Training analysis · Jim",
};

/**
 * The web portal (issue #38). Outside the (shell) group on purpose: no tab
 * bar, no sync engine, no IndexedDB — it reads straight from Postgres, so
 * it works in a desktop browser the install gate would otherwise block
 * (see components/install-gate.tsx and ADR-015).
 */
export default async function PortalPage() {
  try {
    const data = await loadPortalData();
    return <PortalDashboard data={data} />;
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login?next=/portal");
    throw error;
  }
}

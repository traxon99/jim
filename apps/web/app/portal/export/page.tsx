import { PortalExport } from "@/components/portal/portal-export";
import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { loadExportSummary } from "@/lib/portal/load-portal-data";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Export · Training analysis · Jim",
};

/** The Analysis Export section: workouts and bodyweight as CSV, everything as JSON (issue #470). */
export default async function PortalExportPage() {
  try {
    return <PortalExport summary={await loadExportSummary()} />;
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login?next=/portal/export");
    throw error;
  }
}

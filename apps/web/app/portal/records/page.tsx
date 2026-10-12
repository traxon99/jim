import { PortalRecords } from "@/components/portal/portal-records";
import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { loadRecordsData } from "@/lib/portal/load-portal-data";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Records · Training analysis · Jim",
};

/** The Analysis Records section: every personal record (issue #470). */
export default async function PortalRecordsPage() {
  try {
    return <PortalRecords data={await loadRecordsData()} />;
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login?next=/portal/records");
    throw error;
  }
}

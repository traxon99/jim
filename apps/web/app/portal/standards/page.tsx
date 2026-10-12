import { PortalStandards } from "@/components/portal/portal-standards";
import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { loadStandardsData } from "@/lib/portal/load-portal-data";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Strength standards · Training analysis · Jim",
};

/** The Analysis Standards section: each lift's tier and what the next takes (issue #470). */
export default async function PortalStandardsPage() {
  try {
    const data = await loadStandardsData();
    return <PortalStandards data={data} />;
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login?next=/portal/standards");
    throw error;
  }
}

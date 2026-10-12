import { PortalCompare } from "@/components/portal/portal-compare";
import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { loadCompareData } from "@/lib/portal/load-portal-data";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Compare lifts · Training analysis · Jim",
};

/** The Analysis Compare section: several lifts' e1RM on one chart (issue #470). */
export default async function PortalComparePage() {
  try {
    const data = await loadCompareData();
    return <PortalCompare data={data} />;
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login?next=/portal/compare");
    throw error;
  }
}

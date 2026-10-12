import { PortalCardio } from "@/components/portal/portal-cardio";
import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { loadCardioData } from "@/lib/portal/load-portal-data";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Cardio · Training analysis · Jim",
};

/** The Analysis Cardio section: distance, time, pace and records (issue #470). */
export default async function PortalCardioPage() {
  try {
    return <PortalCardio data={await loadCardioData()} />;
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login?next=/portal/cardio");
    throw error;
  }
}

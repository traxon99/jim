import { PortalProgression } from "@/components/portal/portal-progression";
import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { loadProgressionData } from "@/lib/portal/load-portal-data";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "PRP · Training analysis · Jim",
};

/** The Analysis PRP section: the PR Progression block, read-only (issue #470). */
export default async function PortalProgressionPage() {
  try {
    return <PortalProgression data={await loadProgressionData()} />;
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login?next=/portal/progression");
    throw error;
  }
}

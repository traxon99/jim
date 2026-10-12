import { PortalRoutines } from "@/components/portal/portal-routines";
import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { loadPlansData } from "@/lib/portal/load-portal-data";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Routines · Training analysis · Jim",
};

/** The Analysis Routines section: routines, programs and scheduled workouts, read-only (issue #470). */
export default async function PortalRoutinesPage() {
  try {
    return <PortalRoutines data={await loadPlansData()} />;
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login?next=/portal/routines");
    throw error;
  }
}

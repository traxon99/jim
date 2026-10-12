import { PortalStrength } from "@/components/portal/portal-strength";
import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { loadStrengthData } from "@/lib/portal/load-portal-data";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Exercises · Training analysis · Jim",
};

/** The Analysis Exercises section: strength trends per lift (issue #470). */
export default async function PortalExercisesPage() {
  try {
    const data = await loadStrengthData();
    return <PortalStrength data={data} />;
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login?next=/portal/exercises");
    throw error;
  }
}

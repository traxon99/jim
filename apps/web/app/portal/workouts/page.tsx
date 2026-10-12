import { PortalWorkouts } from "@/components/portal/portal-workouts";
import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { loadWorkoutRows } from "@/lib/portal/load-portal-data";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Workouts · Training analysis · Jim",
};

/** The Analysis Workouts section: every finished workout (issue #470). */
export default async function PortalWorkoutsPage() {
  try {
    const { workouts, units } = await loadWorkoutRows();
    return <PortalWorkouts workouts={workouts} units={units} />;
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login?next=/portal/workouts");
    throw error;
  }
}

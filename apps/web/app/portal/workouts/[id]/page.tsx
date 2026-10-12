import { PortalWorkoutDetailView } from "@/components/portal/portal-workout-detail";
import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { loadWorkoutDetail } from "@/lib/portal/load-portal-data";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Workout · Training analysis · Jim",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One workout in full on desktop (issue #470). */
export default async function PortalWorkoutPage({ params }: PageProps<"/portal/workouts/[id]">) {
  const { id } = await params;
  let result: Awaited<ReturnType<typeof loadWorkoutDetail>> | null = null;
  try {
    // Not a uuid can't be a workout, and would make Postgres throw.
    if (UUID.test(id)) result = await loadWorkoutDetail(id);
  } catch (error) {
    if (error instanceof UnauthenticatedError)
      redirect(`/login?next=${encodeURIComponent(`/portal/workouts/${id}`)}`);
    throw error;
  }

  if (!result?.workout) {
    return (
      <div className="flex flex-col items-start gap-2 py-16">
        <h1 className="text-xl font-semibold">Workout not found</h1>
        <Link href="/portal/workouts" className="text-sm font-medium underline underline-offset-4">
          Back to workouts
        </Link>
      </div>
    );
  }
  return <PortalWorkoutDetailView workout={result.workout} units={result.units} />;
}

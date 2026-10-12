import { PortalExerciseDetailView } from "@/components/portal/portal-exercise-detail";
import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { loadExerciseDetail } from "@/lib/portal/load-portal-data";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Exercise · Training analysis · Jim",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One exercise in full on desktop (issue #470). */
export default async function PortalExercisePage({ params }: PageProps<"/portal/exercises/[id]">) {
  const { id } = await params;
  let result: Awaited<ReturnType<typeof loadExerciseDetail>> | null = null;
  try {
    // Not a uuid can't be an exercise, and would make Postgres throw.
    if (UUID.test(id)) result = await loadExerciseDetail(id);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect(`/login?next=${encodeURIComponent(`/portal/exercises/${id}`)}`);
    }
    throw error;
  }

  if (!result?.detail) {
    return (
      <div className="flex flex-col items-start gap-2 py-16">
        <h1 className="text-xl font-semibold">Exercise not found</h1>
        <Link href="/portal/exercises" className="text-sm font-medium underline underline-offset-4">
          Back to exercises
        </Link>
      </div>
    );
  }
  return <PortalExerciseDetailView detail={result.detail} units={result.units} />;
}

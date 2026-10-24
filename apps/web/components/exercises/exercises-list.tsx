"use client";

import {
  CATALOG_SECTION_LABEL,
  type ExerciseCatalog,
  ExerciseCatalogControls,
  ExerciseCatalogRowContent,
  useExerciseCatalog,
} from "@/components/exercises/exercise-catalog";
import { LoadingText } from "@/components/loading-text";
import { FLOATING_BUTTON, PAGE_BODY, PageHeader } from "@/components/page-header";
import { useGymNames } from "@/lib/exercises/display";
import { Plus } from "lucide-react";
import Link from "next/link";

export function ExercisesList({ userId }: { userId: string }) {
  const catalog = useExerciseCatalog({ userId });
  // Gym names for machine rows (issue #450), so two "Lat Pulldown"s at
  // different gyms can be told apart. Deleted gyms are left out.
  const gymNames = useGymNames();
  const { results, usage, yours, rest, restPage, deferredQuery } = catalog;

  function renderRow(exercise: ExerciseCatalog["results"][number]) {
    return (
      <li key={exercise.id}>
        <Link
          href={`/exercises/${exercise.id}`}
          data-ripple
          className="flex items-center justify-between gap-2 py-3"
        >
          <ExerciseCatalogRowContent
            exercise={exercise}
            query={deferredQuery}
            used={usage.get(exercise.id)}
            gymNames={gymNames}
          />
        </Link>
      </li>
    );
  }

  if (!catalog.loaded) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <LoadingText />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title="Exercises"
        actions={
          <Link
            href="/exercises/new"
            aria-label="New exercise"
            data-ripple
            className={FLOATING_BUTTON}
          >
            <Plus className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
          </Link>
        }
      />
      <div className={PAGE_BODY}>
        <ExerciseCatalogControls catalog={catalog} />

        {results.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
            No exercises match.
          </p>
        ) : (
          <>
            {yours.length > 0 && (
              <section className="flex flex-col gap-1">
                <h2 className={CATALOG_SECTION_LABEL}>Your exercises</h2>
                <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                  {yours.map(renderRow)}
                </ul>
              </section>
            )}
            {rest.length > 0 && (
              <section className="flex flex-col gap-1">
                {yours.length > 0 && <h2 className={CATALOG_SECTION_LABEL}>All exercises</h2>}
                <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                  {restPage.visible.map(renderRow)}
                  {restPage.hasMore && (
                    <li ref={restPage.sentinelRef} aria-hidden="true" className="h-px" />
                  )}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

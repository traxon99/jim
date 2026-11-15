"use client";

import { CircleMinus, type IconComponent, ThumbsDown, ThumbsUp } from "@/components/icons/solar";
import { SEGMENTED_TRACK, segmentClass } from "@/components/routines/plan-nav";
import { setExercisePreference } from "@/lib/exercises/preferences";
import { useExercisePreferences } from "@/lib/exercises/use-exercise-preferences";
import type { ExercisePreference } from "@jim/core";
import { useId } from "react";

const OPTIONS: readonly {
  value: ExercisePreference | null;
  label: string;
  Icon: IconComponent;
  activeClass: string;
}[] = [
  {
    value: "like",
    label: "Like",
    Icon: ThumbsUp,
    activeClass: "text-green-700 dark:text-green-400",
  },
  { value: null, label: "None", Icon: CircleMinus, activeClass: "" },
  {
    value: "dislike",
    label: "Dislike",
    Icon: ThumbsDown,
    activeClass: "text-orange-700 dark:text-orange-400",
  },
];

/**
 * Like / None / Dislike on the exercise sheet (issue #795). Smart workouts,
 * the generator and Claude favour a liked lift and never pick a disliked one.
 */
export function ExercisePreferenceControl({ userId, slug }: { userId: string; slug: string }) {
  const headingId = useId();
  const preferences = useExercisePreferences();
  if (!preferences) return null;
  const current = preferences.get(slug) ?? null;

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="text-sm font-semibold">
        Preference
      </h2>
      <div className={`mt-2 ${SEGMENTED_TRACK}`}>
        {OPTIONS.map(({ value, label, Icon, activeClass }) => {
          const active = current === value;
          return (
            <button
              key={label}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (!active) void setExercisePreference(userId, slug, value);
              }}
              className={`${segmentClass(active)} gap-1.5 ${active ? activeClass : ""}`}
            >
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

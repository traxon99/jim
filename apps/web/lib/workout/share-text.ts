import type { SessionDetailExercise, SessionDetailSet } from "@/lib/history/session-detail-entries";
import { setKindLabel } from "@/lib/sessions/set-kinds";
import { type DistanceUnit, type SessionSummary, distanceUnitFor, formatTimedSet } from "@jim/core";

export interface BuildWorkoutShareTextInput {
  name: string | null;
  startedAt: Date;
  units: string;
  summary: SessionSummary;
  exercises: readonly SessionDetailExercise[];
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatSet(set: SessionDetailSet, unit: DistanceUnit): string {
  const value =
    set.weight != null && set.reps != null
      ? `${set.weight}×${set.reps}`
      : set.reps != null
        ? `${set.reps} reps`
        : (formatTimedSet(set, unit) ?? "—");

  const tags = [
    set.kind === "working" ? null : setKindLabel(set.kind),
    set.prKinds.length > 0 ? "PR" : null,
  ].filter((tag): tag is string => tag != null);

  return tags.length > 0 ? `${value} (${tags.join(", ")})` : value;
}

/**
 * Plain-text summary of a finished workout, for sharing outside the app
 * (issue #64) — a stats line matching the finalize screen, then one line
 * per exercise listing every set in order.
 */
export function buildWorkoutShareText({
  name,
  startedAt,
  units,
  summary,
  exercises,
}: BuildWorkoutShareTextInput): string {
  const minutes = Math.round(summary.durationSeconds / 60);
  const prLabel = `${summary.prCount} PR${summary.prCount === 1 ? "" : "s"}`;
  const lines = [
    name ?? "Workout",
    `${DATE_FORMAT.format(startedAt)} · ${minutes} min · ${Math.round(summary.totalVolume).toLocaleString("en-US")} ${units} · ${summary.setCount} sets · ${prLabel}`,
  ];

  const distanceUnit = distanceUnitFor(units === "kg" ? "kg" : "lb");
  for (const exercise of exercises) {
    if (exercise.sets.length === 0) continue;
    lines.push(
      "",
      exercise.exerciseName,
      exercise.sets.map((set) => formatSet(set, distanceUnit)).join(", "),
    );
  }

  return lines.join("\n");
}

export type ShareOutcome = "shared" | "copied" | "cancelled" | "unavailable";

type ShareNavigator = Pick<Navigator, "share" | "clipboard">;

/**
 * Hands a workout's share text to the OS share sheet, falling back to the
 * clipboard where Web Share isn't available (or fails for any reason other
 * than the user dismissing the sheet).
 */
export async function shareWorkoutText(
  title: string,
  text: string,
  nav: Partial<ShareNavigator> | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): Promise<ShareOutcome> {
  if (nav?.share) {
    try {
      await nav.share({ title, text });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // fall through to the clipboard fallback below
    }
  }
  if (nav?.clipboard) {
    await nav.clipboard.writeText(text);
    return "copied";
  }
  return "unavailable";
}

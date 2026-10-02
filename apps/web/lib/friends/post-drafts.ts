import type { Achievement, PostDraft, PrKind, SessionSummary } from "@jim/core";

// What each kind of post says (issue #316). Written on the phone, which has
// the history that describes it, and shown to friends as is.

type Shareable = Omit<PostDraft, "caption">;

const RECORD_LABELS: Record<PrKind, string> = {
  "1rm": "Estimated 1RM",
  weight: "Heaviest weight",
  volume: "Best single-set volume",
  reps_at_weight: "Most reps at a weight",
};

function plural(count: number, word: string) {
  return `${count.toLocaleString()} ${count === 1 ? word : `${word}s`}`;
}

/** "52 min · 18 sets · 2 PRs": a finished workout, in the summary screen's numbers. */
export function workoutPostDraft(
  session: { id: string; name: string | null },
  summary: SessionSummary,
  units: "lb" | "kg",
): Shareable {
  const parts = [
    `${Math.round(summary.durationSeconds / 60)} min`,
    plural(summary.setCount, "set"),
  ];
  if (summary.totalVolume > 0) {
    parts.push(`${Math.round(summary.totalVolume).toLocaleString()} ${units} volume`);
  }
  if (summary.prCount > 0) parts.push(plural(summary.prCount, "PR"));
  return {
    kind: "workout",
    sessionId: session.id,
    title: session.name?.trim() || "Workout",
    detail: parts.join(" · "),
  };
}

/** "Estimated 1RM · 225 lb": a personal record on one exercise. */
export function recordPostDraft(
  exerciseName: string,
  record: { kind: PrKind; value: number },
  units: "lb" | "kg",
): Shareable {
  const value = Math.round(record.value * 100) / 100;
  // A rep record's value is a rep count, not a weight.
  const amount = record.kind === "reps_at_weight" ? plural(value, "rep") : `${value} ${units}`;
  return {
    kind: "record",
    sessionId: null,
    title: exerciseName,
    detail: `${RECORD_LABELS[record.kind]} · ${amount}`,
  };
}

/** An earned achievement, by its title and what it's for. */
export function achievementPostDraft(achievement: Pick<Achievement, "title" | "description">) {
  return {
    kind: "achievement",
    sessionId: null,
    title: achievement.title,
    detail: achievement.description,
  } satisfies Shareable;
}

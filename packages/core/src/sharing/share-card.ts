import {
  distanceUnitFor,
  formatCardioSet,
  formatDistance,
  formatDuration,
  formatPace,
} from "../cardio/format";
import type { AchievementCategory } from "../history/achievements";
import { estimateOneRepMax } from "../one-rep-max";
import type { RoutineIconColor } from "../routines/icon";
import type { PrKind } from "../sessions/personal-records";
import type { StrengthStandardTier } from "../strength-standards/types";

// What an image card says (issue #838): a finished workout, a personal record
// or an achievement, shared as a picture from the phone. This module decides
// every piece of content; the templates only draw what the model holds, so a
// test of the model is a test of what ends up on the card.
//
// Private by default: nothing about injuries, sick days or bodyweight is ever
// an input except bodyweight, and that only when the user turns it on for the
// card (`options.includeBodyweight`).

export const SHARE_CARD_SIZES = ["story", "square"] as const;
export type ShareCardSize = (typeof SHARE_CARD_SIZES)[number];

/** Pixel size of each card: an Instagram story, and a square post. */
export const SHARE_CARD_DIMENSIONS: Record<ShareCardSize, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

/** Most exercises a workout card lists; the rest become "+N more". */
export const SHARE_CARD_MAX_EXERCISES = 6;

/** A workout with no routine color gets Jim's own gradient. */
export type ShareCardColor = RoutineIconColor | "default";

export interface ShareCardOptions {
  /** Show the user's bodyweight on the card. Off unless the user asks. */
  includeBodyweight?: boolean;
}

export interface ShareCardTile {
  label: string;
  value: string;
}

export interface ShareCardExerciseRow {
  name: string;
  /** "185 lb × 5", "5 km · 25:00", "45s": the exercise's best working set. */
  topSet: string;
  /** A record was set on this exercise in the session. */
  pr: boolean;
}

export interface ShareCardModel {
  kind: "workout" | "pr" | "achievement";
  title: string;
  /** Lines under the title: the date, and what the card is for. */
  subtitles: string[];
  /** The one big number or phrase (PR card, achievement card); null on a workout. */
  hero: string | null;
  tiles: ShareCardTile[];
  exercises: ShareCardExerciseRow[];
  /** Exercises left off the list after the cap. */
  moreExercises: number;
  /** Strength-standard badge on a PR card, e.g. "Intermediate". */
  badge: string | null;
  /** The achievement's icon, on an achievement card. */
  icon: AchievementCategory | null;
  colorKey: ShareCardColor;
  /** "@name" shown in the footer; null when it isn't known (offline, signed out). */
  username: string | null;
  /** True when the user opted in to something private (bodyweight) on this card. */
  includesPrivate: boolean;
}

type Units = "lb" | "kg";

export interface ShareCardSet {
  kind: string;
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distance: number | null;
  /** Visible PR kinds this set achieved (empty when none). */
  prKinds: readonly PrKind[];
}

export interface ShareCardExercise {
  name: string;
  /** A warm-up exercise (jumping jacks, arm circles), not training. */
  isWarmup: boolean;
  isCardio: boolean;
  sets: readonly ShareCardSet[];
}

export interface WorkoutCardInput {
  name: string | null;
  startedAt: Date;
  endedAt: Date | null;
  units: Units;
  routineColor: RoutineIconColor | null;
  exercises: readonly ShareCardExercise[];
  username: string | null;
  /** In `units`; only used when `options.includeBodyweight` is on. */
  bodyweight: number | null;
}

export interface PrCardInput {
  exerciseName: string;
  kind: PrKind;
  value: number;
  /** The set behind the record, when it can be found. */
  weight: number | null;
  reps: number | null;
  oneRepMax: number | null;
  achievedAt: Date;
  /** Null: the lift has no published standard. A null tier: below Beginner. */
  standard: { tier: StrengthStandardTier | null } | null;
  units: Units;
  routineColor: RoutineIconColor | null;
  username: string | null;
  bodyweight: number | null;
}

export interface AchievementCardInput {
  title: string;
  description: string;
  category: AchievementCategory;
  achievedAt: Date | null;
  routineColor: RoutineIconColor | null;
  username: string | null;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const TIER_LABELS: Record<StrengthStandardTier, string> = {
  beginner: "Beginner",
  novice: "Novice",
  intermediate: "Intermediate",
  advanced: "Advanced",
  elite: "Elite",
};

const PR_KIND_LABELS: Record<PrKind, string> = {
  "1rm": "Estimated 1RM",
  weight: "Heaviest weight",
  volume: "Best single-set volume",
  reps_at_weight: "Most reps at a weight",
};

function number(value: number): string {
  return Number(value.toFixed(2)).toLocaleString("en-US");
}

function weightLabel(value: number, units: Units): string {
  return `${number(value)} ${units}`;
}

function plural(count: number, word: string): string {
  return `${count.toLocaleString("en-US")} ${word}${count === 1 ? "" : "s"}`;
}

function durationLabel(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** Working sets only: drop and failure sets count, warm-ups never do (#635). */
function workingSets(exercise: ShareCardExercise): ShareCardSet[] {
  return exercise.sets.filter((set) => set.kind !== "warmup");
}

function hasWeightReps(set: ShareCardSet): set is ShareCardSet & { weight: number; reps: number } {
  return set.weight != null && set.weight > 0 && set.reps != null && set.reps > 0;
}

/** The set that tops an exercise: highest e1RM, else most reps, else longest. */
function topSet(sets: readonly ShareCardSet[], isCardio: boolean): ShareCardSet | null {
  let best: ShareCardSet | null = null;
  let bestScore: [number, number, number] = [-1, -1, -1];
  for (const set of sets) {
    const score: [number, number, number] = isCardio
      ? [set.distance ?? 0, set.durationSeconds ?? 0, 0]
      : [
          hasWeightReps(set) ? estimateOneRepMax(set.weight, set.reps) : 0,
          set.reps ?? 0,
          set.durationSeconds ?? 0,
        ];
    const better =
      best === null ||
      score[0] > bestScore[0] ||
      (score[0] === bestScore[0] &&
        (score[1] > bestScore[1] || (score[1] === bestScore[1] && score[2] > bestScore[2])));
    if (better) {
      best = set;
      bestScore = score;
    }
  }
  return best;
}

function formatTopSet(set: ShareCardSet, units: Units, isCardio: boolean): string {
  if (isCardio) return formatCardioSet(set, distanceUnitFor(units));
  if (set.weight != null && set.weight > 0) {
    return set.reps != null
      ? `${number(set.weight)} ${units} × ${set.reps}`
      : weightLabel(set.weight, units);
  }
  if (set.reps != null) return `${set.reps} reps`;
  if (set.durationSeconds != null) {
    return set.durationSeconds < 60
      ? `${set.durationSeconds}s`
      : formatDuration(set.durationSeconds);
  }
  return "—";
}

function colorKeyFor(color: RoutineIconColor | null): ShareCardColor {
  return color ?? "default";
}

function footerUsername(username: string | null): string | null {
  const trimmed = username?.trim().replace(/^@/, "") ?? "";
  return trimmed === "" ? null : `@${trimmed}`;
}

/** The card for a finished workout. */
export function workoutCardModel(
  input: WorkoutCardInput,
  options: ShareCardOptions = {},
): ShareCardModel {
  const units = input.units;
  const rows = input.exercises
    .filter((exercise) => !exercise.isWarmup)
    .flatMap((exercise) => {
      const sets = workingSets(exercise);
      const top = topSet(sets, exercise.isCardio);
      if (!top) return [];
      return [
        {
          name: exercise.name,
          topSet: formatTopSet(top, units, exercise.isCardio),
          pr: sets.some((set) => set.prKinds.length > 0),
          sets,
          isCardio: exercise.isCardio,
        },
      ];
    });

  // The cap keeps the exercises with records first, then the session's order.
  const keep = new Set(
    rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => Number(b.row.pr) - Number(a.row.pr) || a.index - b.index)
      .slice(0, SHARE_CARD_MAX_EXERCISES)
      .map(({ index }) => index),
  );
  const listed = rows.filter((_, index) => keep.has(index));

  const allSets = rows.flatMap((row) => row.sets);
  const setCount = allSets.length;
  const prCount = allSets.reduce((sum, set) => sum + set.prKinds.length, 0);
  const strengthSets = rows.filter((row) => !row.isCardio).flatMap((row) => row.sets);
  const volume = strengthSets.reduce(
    (sum, set) => (hasWeightReps(set) ? sum + set.weight * set.reps : sum),
    0,
  );
  const durationSeconds = input.endedAt
    ? Math.max(0, Math.round((input.endedAt.getTime() - input.startedAt.getTime()) / 1000))
    : null;

  const cardioOnly = rows.length > 0 && rows.every((row) => row.isCardio);
  const tiles: ShareCardTile[] = [];
  if (cardioOnly) {
    const cardioSets = allSets;
    const distance = cardioSets.reduce((sum, set) => sum + (set.distance ?? 0), 0);
    const seconds = cardioSets.reduce((sum, set) => sum + (set.durationSeconds ?? 0), 0);
    const unit = distanceUnitFor(units);
    if (distance > 0) tiles.push({ label: "Distance", value: formatDistance(distance, unit) });
    if (seconds > 0) tiles.push({ label: "Time", value: formatDuration(seconds) });
    const pace = formatPace(seconds, distance, unit);
    if (pace) tiles.push({ label: "Pace", value: pace });
  } else {
    if (durationSeconds !== null) {
      tiles.push({ label: "Duration", value: durationLabel(durationSeconds) });
    }
    if (volume > 0) tiles.push({ label: "Volume", value: weightLabel(Math.round(volume), units) });
    tiles.push({ label: "Sets", value: setCount.toLocaleString("en-US") });
  }
  if (prCount > 0) tiles.push({ label: "PRs", value: prCount.toLocaleString("en-US") });

  let includesPrivate = false;
  if (options.includeBodyweight && input.bodyweight != null && input.bodyweight > 0) {
    tiles.push({ label: "Bodyweight", value: weightLabel(input.bodyweight, units) });
    includesPrivate = true;
  }

  return {
    kind: "workout",
    title: input.name?.trim() || "Workout",
    subtitles: [DATE_FORMAT.format(input.startedAt)],
    hero: null,
    tiles,
    exercises: listed.map(({ name, topSet: top, pr }) => ({ name, topSet: top, pr })),
    moreExercises: rows.length - listed.length,
    badge: null,
    icon: null,
    colorKey: colorKeyFor(input.routineColor),
    username: footerUsername(input.username),
    includesPrivate,
  };
}

/** The card for one personal record. */
export function prCardModel(input: PrCardInput, options: ShareCardOptions = {}): ShareCardModel {
  const units = input.units;
  const value = Math.round(input.value * 100) / 100;
  let hero: string;
  if (input.weight != null && input.weight > 0 && input.reps != null && input.reps > 0) {
    hero = `${number(input.weight)} ${units} × ${input.reps}`;
  } else if (input.kind === "reps_at_weight") {
    hero = plural(value, "rep");
  } else {
    hero = weightLabel(value, units);
  }

  const tiles: ShareCardTile[] = [];
  if (input.oneRepMax != null && input.oneRepMax > 0) {
    tiles.push({ label: "Estimated 1RM", value: weightLabel(Math.round(input.oneRepMax), units) });
  }

  let includesPrivate = false;
  if (options.includeBodyweight && input.bodyweight != null && input.bodyweight > 0) {
    tiles.push({ label: "Bodyweight", value: weightLabel(input.bodyweight, units) });
    includesPrivate = true;
  }

  return {
    kind: "pr",
    title: input.exerciseName,
    subtitles: [PR_KIND_LABELS[input.kind], DATE_FORMAT.format(input.achievedAt)],
    hero,
    tiles,
    exercises: [],
    moreExercises: 0,
    badge: input.standard
      ? input.standard.tier
        ? TIER_LABELS[input.standard.tier]
        : "Below Beginner"
      : null,
    icon: null,
    colorKey: colorKeyFor(input.routineColor),
    username: footerUsername(input.username),
    includesPrivate,
  };
}

/** The card for an unlocked achievement. */
export function achievementCardModel(input: AchievementCardInput): ShareCardModel {
  return {
    kind: "achievement",
    title: input.title,
    subtitles: [
      input.description,
      ...(input.achievedAt ? [DATE_FORMAT.format(input.achievedAt)] : []),
    ],
    hero: null,
    tiles: [],
    exercises: [],
    moreExercises: 0,
    badge: null,
    icon: input.category,
    colorKey: colorKeyFor(input.routineColor),
    username: footerUsername(input.username),
    includesPrivate: false,
  };
}

export type ShareCardInput =
  | { kind: "workout"; input: WorkoutCardInput }
  | { kind: "pr"; input: PrCardInput }
  | { kind: "achievement"; input: AchievementCardInput };

/** The one entry point: a source and the per-card options become a card model. */
export function shareCardModel(
  source: ShareCardInput,
  options: ShareCardOptions = {},
): ShareCardModel {
  switch (source.kind) {
    case "workout":
      return workoutCardModel(source.input, options);
    case "pr":
      return prCardModel(source.input, options);
    case "achievement":
      return achievementCardModel(source.input);
  }
}

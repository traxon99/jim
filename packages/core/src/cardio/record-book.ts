import { type DistanceUnit, formatDuration } from "./format";
import {
  type CardioKind,
  type CardioProfile,
  METERS_PER_UNIT,
  cardioMetricLabel,
  distanceToMeters,
  formatCardioMetric,
} from "./kind";

/**
 * Cardio records per kind (issue #872), computed from set history on demand
 * like `computeCardioBests` (docs/ARCHITECTURE.md §4), never stored.
 *
 * - `distance`: the longest single set (distance types).
 * - `pace`: the fastest pace, split or speed, all kept as seconds per meter.
 * - `std:<id>`: the fastest set at a standard distance (a 5K run, a 2K row).
 * - `duration`: the longest set, for time-only cardio (Stairmaster, rope).
 * - `rounds`: the most rounds in one workout, for bag work.
 *
 * "Longest time" is no record for distance types: a slower run over the
 * same distance would otherwise count as a best.
 */
export type CardioRecordId = "distance" | "pace" | "duration" | "rounds" | `std:${string}`;

export interface CardioStandard {
  id: string;
  label: string;
  meters: number;
}

const MILE = 1609.344;

const STANDARDS: Partial<Record<CardioKind, readonly CardioStandard[]>> = {
  run: [
    { id: "mile", label: "mile", meters: MILE },
    { id: "5k", label: "5K", meters: 5000 },
    { id: "10k", label: "10K", meters: 10_000 },
    { id: "half", label: "half marathon", meters: 21_097.5 },
    { id: "marathon", label: "marathon", meters: 42_195 },
  ],
  walk: [
    { id: "5k", label: "5K", meters: 5000 },
    { id: "10k", label: "10K", meters: 10_000 },
  ],
  ride: [{ id: "40k", label: "40 km", meters: 40_000 }],
  row: [
    { id: "500m", label: "500 m", meters: 500 },
    { id: "2k", label: "2K", meters: 2000 },
    { id: "5k", label: "5K", meters: 5000 },
    { id: "10k", label: "10K", meters: 10_000 },
  ],
  ski: [
    { id: "500m", label: "500 m", meters: 500 },
    { id: "2k", label: "2K", meters: 2000 },
    { id: "5k", label: "5K", meters: 5000 },
  ],
  swim: [
    { id: "100m", label: "100 m", meters: 100 },
    { id: "400m", label: "400 m", meters: 400 },
    { id: "1500m", label: "1,500 m", meters: 1500 },
  ],
};

export function cardioStandards(kind: CardioKind): readonly CardioStandard[] {
  return STANDARDS[kind] ?? [];
}

/**
 * A set counts at a standard distance when it's that distance give or take
 * the rounding a watch or machine adds: from 0.5% short to 10% long. Its
 * time is scaled to the exact distance at the set's own pace.
 */
const STANDARD_SHORT = 0.995;
const STANDARD_LONG = 1.1;

export interface CardioRecordSet {
  id: string;
  /** Groups sets into a workout, for rounds: the session exercise id. */
  groupId: string;
  completedAt: Date;
  /** As stored, in the user's mi/km; numeric columns sync as strings. */
  distance: number | string | null;
  durationSeconds: number | null;
}

export interface CardioRecordEntry {
  id: CardioRecordId;
  /** Seconds (time records), seconds per meter (pace), meters (distance) or a count (rounds). */
  value: number;
  setId: string;
  achievedAt: Date;
}

/** Whether a smaller value is the better one. */
export function cardioRecordLowerIsBetter(id: CardioRecordId): boolean {
  return id === "pace" || id.startsWith("std:");
}

function positive(value: number | string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Every record value one set holds on its own (rounds come from its group). */
function setScores(
  set: CardioRecordSet,
  kind: CardioKind,
  unit: DistanceUnit,
  tracksDistance: boolean,
): Map<CardioRecordId, number> {
  const scores = new Map<CardioRecordId, number>();
  const duration = positive(set.durationSeconds);
  const distance = positive(set.distance);
  if (!tracksDistance) {
    if (duration != null && kind !== "boxing") scores.set("duration", duration);
    return scores;
  }
  if (distance == null) return scores;
  const meters = distanceToMeters(distance, unit);
  scores.set("distance", meters);
  if (duration == null) return scores;
  scores.set("pace", duration / meters);
  for (const standard of cardioStandards(kind)) {
    if (meters >= standard.meters * STANDARD_SHORT && meters <= standard.meters * STANDARD_LONG) {
      scores.set(`std:${standard.id}`, (duration * standard.meters) / meters);
    }
  }
  return scores;
}

function better(id: CardioRecordId, next: number, current: number): boolean {
  return cardioRecordLowerIsBetter(id) ? next < current : next > current;
}

export interface CardioRecordBook {
  /** Each record's best, keyed by id. */
  bests: Map<CardioRecordId, CardioRecordEntry>;
  /** For each set, the records it beat when it was logged (a first value beats nothing). */
  bySet: Map<string, CardioRecordId[]>;
}

/**
 * Walks `sets` oldest first and keeps every record. A set beats a record
 * only when there was an earlier value to beat: every first cardio set would
 * otherwise celebrate itself. Bag rounds beat the most rounds of any other
 * workout on the round that passes it.
 */
export function buildCardioRecordBook(
  sets: readonly CardioRecordSet[],
  kind: CardioKind,
  unit: DistanceUnit,
  tracksDistance: boolean,
): CardioRecordBook {
  const ordered = [...sets].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  const bests = new Map<CardioRecordId, CardioRecordEntry>();
  const bySet = new Map<string, CardioRecordId[]>();
  const roundsByGroup = new Map<string, number>();
  for (const set of ordered) {
    const beaten: CardioRecordId[] = [];
    for (const [id, value] of setScores(set, kind, unit, tracksDistance)) {
      const current = bests.get(id);
      if (!current || better(id, value, current.value)) {
        if (current) beaten.push(id);
        bests.set(id, { id, value, setId: set.id, achievedAt: set.completedAt });
      }
    }
    if (kind === "boxing" && positive(set.durationSeconds) != null) {
      const count = (roundsByGroup.get(set.groupId) ?? 0) + 1;
      roundsByGroup.set(set.groupId, count);
      const otherBest = Math.max(
        0,
        ...[...roundsByGroup].filter(([group]) => group !== set.groupId).map(([, n]) => n),
      );
      const current = bests.get("rounds");
      if (!current || count > current.value) {
        if (current && otherBest > 0 && count === otherBest + 1) beaten.push("rounds");
        bests.set("rounds", {
          id: "rounds",
          value: count,
          setId: set.id,
          achievedAt: set.completedAt,
        });
      }
    }
    if (beaten.length > 0) bySet.set(set.id, beaten);
  }
  return { bests, bySet };
}

/** Display order on the exercise card. */
export function cardioRecordOrder(kind: CardioKind, tracksDistance: boolean): CardioRecordId[] {
  if (!tracksDistance) return kind === "boxing" ? ["rounds"] : ["duration"];
  return [...cardioStandards(kind).map((s) => `std:${s.id}` as const), "distance", "pace"];
}

/** "Fastest 5K", "Longest run", "Best split", "Top speed", "Most rounds". */
export function cardioRecordLabel(id: CardioRecordId, profile: CardioProfile): string {
  if (id.startsWith("std:")) {
    const standard = cardioStandards(profile.kind).find((s) => `std:${s.id}` === id);
    return `Fastest ${standard?.label ?? id.slice(4)}`;
  }
  switch (id) {
    case "distance":
      return `Longest ${profile.noun}`;
    case "duration":
      return `Longest ${profile.noun}`;
    case "rounds":
      return "Most rounds";
    default:
      return profile.metric === "split500"
        ? "Best split"
        : profile.metric === "per100"
          ? "Best 100 m pace"
          : profile.metric === "speed"
            ? "Top speed"
            : "Fastest pace";
  }
}

/** A record's value as the card shows it: "26:05", "3.1 mi", "8:25 /mi", "16.3 mph", "6 rounds". */
export function formatCardioRecordValue(
  id: CardioRecordId,
  value: number,
  unit: DistanceUnit,
  profile: CardioProfile,
): string {
  if (id === "rounds") return `${value} ${value === 1 ? "round" : "rounds"}`;
  if (id === "duration" || id.startsWith("std:")) return formatDuration(value);
  if (id === "distance") {
    return profile.meters
      ? `${Math.round(value).toLocaleString("en-US")} m`
      : `${Number((value / METERS_PER_UNIT[unit]).toFixed(2))} ${unit}`;
  }
  const metric = formatCardioMetric(value, unit, profile);
  const label = cardioMetricLabel(profile, unit);
  return `${metric} ${label}`;
}

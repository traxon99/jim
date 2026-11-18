import { convertWeight } from "../data-transfer/workout-csv";

// Friend leaderboards (issue #837). Pure ranking shared by the web app and,
// later, the native app so both order a board identically.

export type LeaderboardMetric = "e1rm" | "best_set" | "relative";

export const LEADERBOARD_METRICS: readonly LeaderboardMetric[] = ["e1rm", "best_set", "relative"];

/** One participant on a lift's board, in the units they log in. */
export interface LeaderboardRow {
  userId: string;
  username: string;
  avatar: string | null;
  isMe: boolean;
  units: "lb" | "kg";
  bestE1rm: number | null;
  bestE1rmAt: string | null;
  bestWeight: number | null;
  bestWeightReps: number | null;
  bestWeightAt: string | null;
  /** Best e1RM over bodyweight; null unless the person shares it. */
  relativeStrength: number | null;
}

export interface RankedLeaderboardEntry {
  /** 1-based; tied values never share a rank, the earlier lift ranks first. */
  rank: number;
  userId: string;
  username: string;
  avatar: string | null;
  isMe: boolean;
  /** The ranked number: weight in the viewer's units, or a bodyweight ratio. */
  value: number;
  /** Reps of the best set; null for the other metrics. */
  reps: number | null;
  /** When it was set (ISO), or null when unknown. */
  at: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The row's number for `metric`, plus its reps and when, or null if it has none. */
function entryFor(
  row: LeaderboardRow,
  metric: LeaderboardMetric,
  viewerUnits: "lb" | "kg",
): Omit<RankedLeaderboardEntry, "rank"> | null {
  const base = {
    userId: row.userId,
    username: row.username,
    avatar: row.avatar,
    isMe: row.isMe,
  };
  if (metric === "relative") {
    if (row.relativeStrength === null) return null;
    return { ...base, value: round2(row.relativeStrength), reps: null, at: row.bestE1rmAt };
  }
  const raw = metric === "e1rm" ? row.bestE1rm : row.bestWeight;
  if (raw === null) return null;
  return {
    ...base,
    value: round2(convertWeight(raw, row.units, viewerUnits)),
    reps: metric === "best_set" ? row.bestWeightReps : null,
    at: metric === "e1rm" ? row.bestE1rmAt : row.bestWeightAt,
  };
}

const atMs = (at: string | null) => (at === null ? Number.POSITIVE_INFINITY : Date.parse(at));

/**
 * Orders a board by `metric`, highest first. Weights are shown in
 * `viewerUnits`, whatever each person logs in. A tie goes to whoever set the
 * value first. Rows with nothing to rank on (no relative strength shared)
 * are left off.
 */
export function rankLeaderboard(
  rows: readonly LeaderboardRow[],
  metric: LeaderboardMetric,
  viewerUnits: "lb" | "kg",
): RankedLeaderboardEntry[] {
  const entries = rows
    .map((row) => entryFor(row, metric, viewerUnits))
    .filter((entry): entry is Omit<RankedLeaderboardEntry, "rank"> => entry !== null);
  entries.sort(
    (a, b) =>
      b.value - a.value ||
      atMs(a.at) - atMs(b.at) ||
      Number(b.isMe) - Number(a.isMe) ||
      a.username.localeCompare(b.username),
  );
  return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/**
 * The first `limit` entries, plus the viewer's own row (with its real rank)
 * when they sit below the cut, so they always see where they stand.
 */
export function leaderboardWindow(
  ranked: readonly RankedLeaderboardEntry[],
  limit = 5,
): { top: RankedLeaderboardEntry[]; me: RankedLeaderboardEntry | null } {
  const top = ranked.slice(0, limit);
  const me = ranked.find((entry) => entry.isMe) ?? null;
  return { top, me: me !== null && me.rank > limit ? me : null };
}

/** A machine board's key: make, model and the pinned gym's coordinates. */
export interface LeaderboardMachine {
  brand: string;
  model: string;
  latitude: number;
  longitude: number;
}

/**
 * The key a machine exercise is matched on, or why it can't be: a machine
 * exercise needs both make and model and a gym with a pinned place (issue
 * #450/#462). `null` machine means a plain exercise, which needs nothing.
 */
export function leaderboardMachineKey(exercise: {
  machineBrand?: string | null;
  machineModel?: string | null;
  gym?: { latitude?: number | null; longitude?: number | null } | null;
}):
  | { eligible: true; machine: LeaderboardMachine | null }
  | { eligible: false; reason: "make-model" | "gym" } {
  const brand = exercise.machineBrand?.trim() ?? "";
  const model = exercise.machineModel?.trim() ?? "";
  if (brand === "" && model === "") return { eligible: true, machine: null };
  if (brand === "" || model === "") return { eligible: false, reason: "make-model" };
  const { latitude, longitude } = exercise.gym ?? {};
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return { eligible: false, reason: "gym" };
  }
  return { eligible: true, machine: { brand, model, latitude, longitude } };
}

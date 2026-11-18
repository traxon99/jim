import {
  type LeaderboardMachine,
  type LeaderboardRow,
  convertWeight,
  isValidCoordinate,
} from "@jim/core";
import type { DbOrTx } from "@jim/db";
import { sql } from "drizzle-orm";
import type { LeaderboardLift, LeaderboardPayload } from "./types";

// Friend leaderboards (issue #837) read migration 0080's SECURITY DEFINER
// functions, which act for auth.uid() and check the friendship themselves
// (ADR-017). Nothing here touches IndexedDB.

interface BoardRowRecord extends Record<string, unknown> {
  user_id: string;
  username: string | null;
  avatar: string | null;
  is_me: boolean;
  units: "lb" | "kg";
  best_e1rm: string | number | null;
  best_e1rm_at: Date | string | null;
  best_weight: string | number | null;
  best_weight_reps: number | null;
  best_weight_at: Date | string | null;
  relative_strength: string | number | null;
}

interface LiftRecord extends Record<string, unknown> {
  slug: string;
  name: string;
  machine: LeaderboardMachine | null;
  participants: number;
}

const num = (value: string | number | null) => (value === null ? null : Number(value));
const iso = (value: Date | string | null) =>
  value === null ? null : new Date(value).toISOString();

/** A `machine` query value (JSON), or why it can't be used; null input means "no machine". */
export function parseMachineParam(raw: string | null): LeaderboardMachine | null | "invalid" {
  if (raw === null || raw === "") return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return "invalid";
    const { brand, model, latitude, longitude } = value as Record<string, unknown>;
    if (typeof brand !== "string" || typeof model !== "string") return "invalid";
    if (brand.trim() === "" || model.trim() === "") return "invalid";
    if (!isValidCoordinate(latitude, longitude)) return "invalid";
    return {
      brand: brand.trim(),
      model: model.trim(),
      latitude: latitude as number,
      longitude: longitude as number,
    };
  } catch {
    return "invalid";
  }
}

/**
 * Everyone on a lift's board, with weights converted into the viewer's units
 * so the client only has to sort. A friend's units never leak into the UI.
 */
export async function loadLeaderboard(
  tx: DbOrTx,
  viewerUnits: "lb" | "kg",
  slug: string,
  machine: LeaderboardMachine | null,
): Promise<LeaderboardPayload> {
  const rows = await tx.execute<BoardRowRecord>(
    sql`SELECT * FROM friend_lift_leaderboard(${slug}, ${machine ? JSON.stringify(machine) : null}::jsonb)`,
  );
  const toViewer = (value: string | number | null, from: "lb" | "kg") =>
    value === null ? null : convertWeight(Number(value), from, viewerUnits);
  const board: LeaderboardRow[] = rows.map((row) => ({
    userId: row.user_id,
    username: row.username ?? "friend",
    avatar: row.avatar,
    isMe: row.is_me,
    units: viewerUnits,
    bestE1rm: toViewer(row.best_e1rm, row.units),
    bestE1rmAt: iso(row.best_e1rm_at),
    bestWeight: toViewer(row.best_weight, row.units),
    bestWeightReps: row.best_weight_reps,
    bestWeightAt: iso(row.best_weight_at),
    relativeStrength: num(row.relative_strength),
  }));
  return { units: viewerUnits, rows: board };
}

export async function loadLeaderboardLifts(tx: DbOrTx): Promise<LeaderboardLift[]> {
  const rows = await tx.execute<LiftRecord>(sql`SELECT * FROM friend_leaderboard_lifts()`);
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    machine: row.machine,
    participants: Number(row.participants),
  }));
}

import { unauthenticated } from "@/lib/api/route-helpers";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import type { FriendProfilePayload, ProfileLiftHighlight } from "@/lib/friends/types";
import { normalizeUsername } from "@jim/core";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

interface ProfileRow extends Record<string, unknown> {
  friend_profile: Record<string, unknown> | null;
}

function parseHighlights(raw: unknown): ProfileLiftHighlight[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const row = item as Record<string, unknown>;
    const key = row.key;
    const label = row.label;
    const e1rm = row.e1rm;
    const units = row.units;
    if (typeof key !== "string" || typeof label !== "string" || typeof e1rm !== "number") {
      return [];
    }
    if (units !== "lb" && units !== "kg") return [];
    return [{ key, label, e1rm, units }];
  });
}

function parseDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => {
      if (value instanceof Date) return value.toISOString();
      if (typeof value === "string") return value;
      return null;
    })
    .filter((value): value is string => value !== null);
}

/** An accepted friend's profile header (issue #751). */
export async function GET(_request: Request, context: { params: Promise<{ username: string }> }) {
  const { username: raw } = await context.params;
  const username = normalizeUsername(raw);
  if (username === "") {
    return NextResponse.json({ error: "Unknown user" }, { status: 404 });
  }

  try {
    const profile = await withUserDb(async (tx): Promise<FriendProfilePayload | null> => {
      const [row] = await tx.execute<ProfileRow>(
        sql`SELECT friend_profile(${username}) AS friend_profile`,
      );
      const payload = row?.friend_profile;
      if (!payload || typeof payload !== "object") return null;
      const p = payload as Record<string, unknown>;
      const userId = p.userId;
      const uname = p.username;
      if (typeof userId !== "string" || typeof uname !== "string") return null;
      return {
        userId,
        username: uname,
        avatar: typeof p.avatar === "string" ? p.avatar : null,
        displayName: typeof p.displayName === "string" ? p.displayName : null,
        bio: typeof p.bio === "string" ? p.bio : null,
        shareWorkouts: p.shareWorkouts === true,
        shareWorkoutDetails: p.shareWorkoutDetails === true,
        units: p.units === "kg" ? "kg" : "lb",
        weekStart: typeof p.weekStart === "number" ? p.weekStart : 0,
        timeZone: typeof p.timeZone === "string" ? p.timeZone : null,
        workoutCount: Number(p.workoutCount) || 0,
        friendCount: Number(p.friendCount) || 0,
        sessionDates: parseDates(p.sessionDates),
        defaultGymName: typeof p.defaultGymName === "string" ? p.defaultGymName : null,
        liftHighlights: parseHighlights(p.liftHighlights),
      };
    });
    if (!profile) return NextResponse.json({ error: "Unknown user" }, { status: 404 });
    return NextResponse.json(profile);
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

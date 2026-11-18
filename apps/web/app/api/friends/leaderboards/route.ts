import { unauthenticated } from "@/lib/api/route-helpers";
import { ensureUserRow } from "@/lib/db/ensure-user-row";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import { loadLeaderboardLifts } from "@/lib/friends/leaderboard-data";
import { NextResponse } from "next/server";

/** The lifts you and at least one friend have both logged, busiest first (issue #837). */
export async function GET() {
  try {
    const lifts = await withUserDb(async (tx, userId, email) => {
      await ensureUserRow(tx, userId, email);
      return loadLeaderboardLifts(tx);
    });
    return NextResponse.json({ lifts });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

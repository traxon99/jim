import { unauthenticated } from "@/lib/api/route-helpers";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import type { FriendRecordRow } from "@/lib/friends/types";
import { normalizeUsername } from "@jim/core";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

interface RecordRow extends Record<string, unknown> {
  exercise_name: string;
  kind: FriendRecordRow["kind"];
  value: string | number;
  weight: string | number | null;
  reps: number | null;
  achieved_at: Date | string;
}

interface FriendIdRow extends Record<string, unknown> {
  user_id: string;
}

/** A friend's PR rows when they share workout details (issue #751). */
export async function GET(_request: Request, context: { params: Promise<{ username: string }> }) {
  const { username: raw } = await context.params;
  const username = normalizeUsername(raw);
  if (username === "") {
    return NextResponse.json({ error: "Unknown user" }, { status: 404 });
  }

  try {
    const records = await withUserDb(async (tx): Promise<FriendRecordRow[]> => {
      const [friend] = await tx.execute<FriendIdRow>(
        sql`SELECT (friend_profile(${username})->>'userId')::uuid AS user_id`,
      );
      if (!friend?.user_id) return [];
      const rows = await tx.execute<RecordRow>(
        sql`SELECT * FROM friend_records(${friend.user_id}::uuid)`,
      );
      return rows.map((row) => ({
        exerciseName: row.exercise_name,
        kind: row.kind,
        value: Number(row.value),
        weight: row.weight === null ? null : Number(row.weight),
        reps: row.reps,
        achievedAt: new Date(row.achieved_at).toISOString(),
      }));
    });
    return NextResponse.json({ records });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

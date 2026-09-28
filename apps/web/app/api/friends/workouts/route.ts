import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import type { FriendWorkout, FriendWorkoutExercise } from "@/lib/friends/types";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

interface WorkoutRow extends Record<string, unknown> {
  session_id: string;
  user_id: string;
  username: string;
  units: FriendWorkout["units"];
  name: string | null;
  started_at: Date | string;
  ended_at: Date | string;
  exercises: FriendWorkoutExercise[];
}

/**
 * Accepted friends' latest finished workouts, summarized server-side by
 * migration 0023's `friend_workouts()` — a friend's raw rows never leave
 * Postgres, and never reach this user's IndexedDB.
 */
export async function GET() {
  try {
    const workouts = await withUserDb(async (tx): Promise<FriendWorkout[]> => {
      const rows = await tx.execute<WorkoutRow>(sql`SELECT * FROM friend_workouts(30)`);
      return rows.map((row) => ({
        sessionId: row.session_id,
        userId: row.user_id,
        username: row.username,
        units: row.units,
        name: row.name,
        startedAt: new Date(row.started_at).toISOString(),
        endedAt: new Date(row.ended_at).toISOString(),
        exercises: row.exercises.map((exercise) => ({
          name: exercise.name,
          sets: Number(exercise.sets),
          topWeight: exercise.topWeight === null ? null : Number(exercise.topWeight),
          topReps: exercise.topReps === null ? null : Number(exercise.topReps),
        })),
      }));
    });
    return NextResponse.json({ workouts });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    throw error;
  }
}

import { unauthenticated } from "@/lib/api/route-helpers";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import { NO_COMMENTS, loadCommentSummaries } from "@/lib/friends/comment-summaries";
import { loadReactionNames } from "@/lib/friends/reaction-names";
import type {
  FriendWorkout,
  FriendWorkoutExercise,
  FriendWorkoutMuscle,
  FriendWorkoutRecord,
  WorkoutReaction,
} from "@/lib/friends/types";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

interface WorkoutRow extends Record<string, unknown> {
  session_id: string;
  user_id: string;
  username: string;
  avatar: string | null;
  units: FriendWorkout["units"];
  name: string | null;
  started_at: Date | string;
  ended_at: Date | string;
  routine_color: FriendWorkout["routineColor"];
  gym_name: string | null;
  volume: string | number | null;
  muscles: FriendWorkoutMuscle[];
  records: FriendWorkoutRecord[];
  exercises: FriendWorkoutExercise[];
  reactions: WorkoutReaction[];
}

/**
 * Accepted friends' latest finished workouts and their reactions, summarized
 * server-side by `friend_workouts()` (migrations 0023/0025/0031/0061) — a friend's raw
 * rows never leave Postgres, and never reach this user's IndexedDB.
 */
export async function GET() {
  try {
    const workouts = await withUserDb(async (tx): Promise<FriendWorkout[]> => {
      const rows = await tx.execute<WorkoutRow>(sql`SELECT * FROM friend_workouts(30)`);
      const sessionIds = rows.map((row) => row.session_id);
      const { bySession } = await loadCommentSummaries(tx, sessionIds, []);
      const { bySession: namesBySession } = await loadReactionNames(tx, sessionIds, []);
      return rows.map((row) => ({
        sessionId: row.session_id,
        userId: row.user_id,
        username: row.username,
        avatar: row.avatar,
        units: row.units,
        name: row.name,
        startedAt: new Date(row.started_at).toISOString(),
        endedAt: new Date(row.ended_at).toISOString(),
        routineColor: row.routine_color,
        gymName: row.gym_name,
        volume: row.volume === null ? null : Number(row.volume),
        muscles: row.muscles.map((m) => ({ muscle: m.muscle, sets: Number(m.sets) })),
        records: row.records.map((record) => ({
          exercise: record.exercise,
          kind: record.kind,
          value: Number(record.value),
          weight: record.weight === null ? null : Number(record.weight),
          reps: record.reps === null ? null : Number(record.reps),
        })),
        exercises: row.exercises.map((exercise) => ({
          name: exercise.name,
          sets: Number(exercise.sets),
          topWeight: exercise.topWeight === null ? null : Number(exercise.topWeight),
          topReps: exercise.topReps === null ? null : Number(exercise.topReps),
        })),
        reactions: row.reactions.map((reaction) => ({
          kind: reaction.kind,
          count: Number(reaction.count),
          mine: reaction.mine,
        })),
        reactedBy: namesBySession.get(row.session_id) ?? [],
        comments: bySession.get(row.session_id) ?? NO_COMMENTS,
      }));
    });
    return NextResponse.json({ workouts });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return unauthenticated();
    }
    throw error;
  }
}

import { ensureUserRow } from "@/lib/db/ensure-user-row";
import {
  type WeekRingPerson,
  addWeeks,
  clampWeeklyWorkoutGoal,
  isValidTimeZone,
  startOfWeek,
} from "@jim/core";
import type { DbOrTx } from "@jim/db";
import { sql } from "drizzle-orm";

interface UserRingRow {
  id: string;
  username: string | null;
  avatar: string | null;
  shareWorkouts: boolean;
  weeklyWorkoutGoal: number;
  weekStart: number;
  timeZone: string | null;
}

function userZone(timeZone: string | null | undefined): string | undefined {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : undefined;
}

async function sessionsInRange(
  tx: DbOrTx,
  userId: string,
  since: Date,
  until: Date,
): Promise<{ startedAt: Date }[]> {
  const rows = await tx.execute<{ started_at: Date | string }>(
    sql`SELECT started_at FROM friend_sessions_in_range(${userId}, ${since.toISOString()}, ${until.toISOString()})`,
  );
  return rows.map((row) => ({ startedAt: new Date(row.started_at) }));
}

async function ringRowForUser(
  tx: DbOrTx,
  row: UserRingRow,
  now: Date,
  isSelf: boolean,
): Promise<WeekRingPerson> {
  const zone = userZone(row.timeZone);
  const since = startOfWeek(now, row.weekStart, zone);
  const until = addWeeks(since, 1, row.weekStart, zone);
  const sessions = await sessionsInRange(tx, row.id, since, until);
  const last = sessions.reduce<Date | null>((best, session) => {
    return !best || session.startedAt > best ? session.startedAt : best;
  }, null);
  return {
    userId: row.id,
    username: row.username ?? "user",
    avatar: row.avatar,
    shareWorkouts: isSelf ? true : row.shareWorkouts,
    workoutsThisWeek: sessions.length,
    weeklyGoal: clampWeeklyWorkoutGoal(row.weeklyWorkoutGoal),
    lastWorkoutAt: last?.toISOString() ?? null,
    isSelf,
  };
}

/** You and each accepted friend, with this week's workout count and goal. */
export async function loadWeekRingPeople(
  tx: DbOrTx,
  viewerId: string,
  viewerEmail: string,
  now: Date = new Date(),
): Promise<WeekRingPerson[]> {
  const me = await ensureUserRow(tx, viewerId, viewerEmail);
  const meRow: UserRingRow = {
    id: me.id,
    username: me.username,
    avatar: me.avatar,
    shareWorkouts: me.shareWorkouts,
    weeklyWorkoutGoal: me.weeklyWorkoutGoal,
    weekStart: me.weekStart,
    timeZone: me.timeZone,
  };

  interface FriendPeerRow extends Record<string, unknown> {
    user_id: string;
    username: string | null;
    avatar: string | null;
    share_workouts: boolean;
    weekly_workout_goal: number;
    week_start: number;
    time_zone: string | null;
  }
  const friendRows = (
    await tx.execute<FriendPeerRow>(sql`SELECT * FROM friend_week_ring_peers()`)
  ).map(
    (row): UserRingRow => ({
      id: row.user_id,
      username: row.username,
      avatar: row.avatar,
      shareWorkouts: row.share_workouts,
      weeklyWorkoutGoal: row.weekly_workout_goal,
      weekStart: row.week_start,
      timeZone: row.time_zone,
    }),
  );

  const self = await ringRowForUser(tx, meRow, now, true);
  const friends = await Promise.all(friendRows.map((row) => ringRowForUser(tx, row, now, false)));
  return [self, ...friends];
}

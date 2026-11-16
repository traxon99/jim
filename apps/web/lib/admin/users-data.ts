import { serviceDb } from "@/lib/db/user-scoped";
import { type SettingsPayload, toSettingsPayload } from "@/lib/settings/server-settings";
import type { AccountRole } from "@jim/core";
import { type DbOrTx, users } from "@jim/db";
import { eq, sql } from "drizzle-orm";

/** One row of the admin Users list (issue #807): account facts, no training content. */
export interface AdminUserRow {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  role: AccountRole;
  createdAt: string;
  /** The last sync push the server applied, as a stand-in for "last opened". */
  lastActiveAt: string | null;
  workouts: number;
}

export interface AdminUserDetail extends AdminUserRow {
  bio: string | null;
  shareWorkouts: boolean;
  shareWorkoutDetails: boolean;
  discoverableByFriendsOfFriends: boolean;
  workoutsLast7Days: number;
  disabled: boolean;
  /** The last force-refresh requests (issue #808). */
  updateRequestedAt: string | null;
  resetRequestedAt: string | null;
  settings: SettingsPayload;
}

export const ADMIN_USERS_PAGE_SIZE = 100;

/** Which column the list sorts by, newest first. */
export type AdminUserSort = "active" | "joined";

const ACTIVITY = sql`(SELECT max(m.applied_at) FROM sync_mutations m WHERE m.user_id = users.id)`;
const WORKOUTS = sql`(SELECT count(*)::int FROM sessions s
  WHERE s.user_id = users.id AND s.ended_at IS NOT NULL AND s.deleted_at IS NULL)`;

/** `%term%` for ILIKE with the user's own `%`, `_` and `\` taken literally. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * Accounts matching `query` by email, username or display name. Only called
 * after requireAdmin(): this reads every account on the server's connection.
 */
export async function listAdminUsers(
  options: { query?: string; sort?: AdminUserSort; limit?: number } = {},
): Promise<{ rows: AdminUserRow[]; hasMore: boolean }> {
  const limit = options.limit ?? ADMIN_USERS_PAGE_SIZE;
  const term = options.query?.trim() ?? "";
  const pattern = likePattern(term);
  const where = term
    ? sql`users.email ILIKE ${pattern} OR users.username ILIKE ${pattern} OR users.display_name ILIKE ${pattern}`
    : sql`true`;
  const order =
    options.sort === "joined"
      ? sql`users.created_at DESC`
      : sql`last_active_at DESC NULLS LAST, users.created_at DESC`;

  const result = await serviceDb().execute<{
    id: string;
    email: string;
    username: string | null;
    display_name: string | null;
    role: AccountRole;
    created_at: Date | string;
    last_active_at: Date | string | null;
    workouts: number;
  }>(sql`
    SELECT users.id, users.email, users.username, users.display_name, users.role,
           users.created_at, ${ACTIVITY} AS last_active_at, ${WORKOUTS} AS workouts
    FROM users
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ${limit + 1}
  `);
  const rows = [...result].map((row) => ({
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    createdAt: toIso(row.created_at) ?? "",
    lastActiveAt: toIso(row.last_active_at),
    workouts: Number(row.workouts),
  }));
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

/** One account for its admin page, or null when there's no such account. */
export async function loadAdminUser(
  userId: string,
  db: DbOrTx = serviceDb(),
): Promise<AdminUserDetail | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row) return null;
  const [stats] = [
    ...(await db.execute<{
      last_active_at: Date | string | null;
      workouts: number;
      workouts_7d: number;
      banned_until: Date | string | null;
    }>(sql`
      SELECT
        (SELECT max(applied_at) FROM sync_mutations WHERE user_id = ${userId}) AS last_active_at,
        (SELECT count(*)::int FROM sessions WHERE user_id = ${userId}
          AND ended_at IS NOT NULL AND deleted_at IS NULL) AS workouts,
        (SELECT count(*)::int FROM sessions WHERE user_id = ${userId}
          AND ended_at IS NOT NULL AND deleted_at IS NULL
          AND started_at > now() - interval '7 days') AS workouts_7d,
        (SELECT banned_until FROM auth.users WHERE id = ${userId}) AS banned_until
    `)),
  ];
  const bannedUntil = toIso(stats?.banned_until ?? null);
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    lastActiveAt: toIso(stats?.last_active_at ?? null),
    workouts: Number(stats?.workouts ?? 0),
    workoutsLast7Days: Number(stats?.workouts_7d ?? 0),
    bio: row.bio,
    shareWorkouts: row.shareWorkouts,
    shareWorkoutDetails: row.shareWorkoutDetails,
    discoverableByFriendsOfFriends: row.discoverableByFriendsOfFriends,
    disabled: bannedUntil !== null && Date.parse(bannedUntil) > Date.now(),
    updateRequestedAt: row.updateRequestedAt?.toISOString() ?? null,
    resetRequestedAt: row.resetRequestedAt?.toISOString() ?? null,
    settings: toSettingsPayload(row),
  };
}

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

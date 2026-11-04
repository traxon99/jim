import type { V1Status } from "@jim/core";
import { routines, sessions, syncMutations, users } from "@jim/db";
import { and, desc, eq, isNull, max } from "drizzle-orm";
import { type UserContext, withUser } from "../context.js";

/**
 * `GET /v1/status` (#737): the token's user, when the phone last synced and
 * the workout in progress, if any. Jackson OS uses it as its health check.
 * Runs under RLS as the token's user, like every /v1 handler.
 */
export async function v1Status(context: UserContext): Promise<V1Status> {
  return withUser(context, async (tx) => {
    const [user] = await tx
      .select({
        username: users.username,
        units: users.units,
        weekStart: users.weekStart,
        timeZone: users.timeZone,
      })
      .from(users)
      .where(eq(users.id, context.userId));
    const [synced] = await tx
      .select({ at: max(syncMutations.appliedAt) })
      // No user filter: RLS limits both reads to the token's user.
      .from(syncMutations);
    const [active] = await tx
      .select({
        id: sessions.id,
        name: sessions.name,
        routineName: routines.name,
        startedAt: sessions.startedAt,
      })
      .from(sessions)
      .leftJoin(routines, eq(routines.id, sessions.routineId))
      .where(and(isNull(sessions.endedAt), isNull(sessions.deletedAt)))
      .orderBy(desc(sessions.startedAt))
      .limit(1);

    return {
      user: {
        username: user?.username ?? null,
        units: user?.units ?? "lb",
        weekStart: user?.weekStart ?? 0,
        timeZone: user?.timeZone ?? null,
      },
      lastSyncedAt: synced?.at ? new Date(synced.at).toISOString() : null,
      activeWorkout: active
        ? {
            id: active.id,
            name: active.name ?? active.routineName ?? null,
            startedAt: active.startedAt.toISOString(),
          }
        : null,
      tokenScope: context.scope ?? "read_write",
    };
  });
}

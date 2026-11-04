import {
  type StrengthProfile,
  type V1Prs,
  ageFromBirthdate,
  isVisiblePr,
  repsAtWeightExerciseIds,
  standardLiftForSlug,
  tierForOneRepMax,
} from "@jim/core";
import { exercises, personalRecords, sessionExercises, sets, users } from "@jim/db";
import { eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { type UserContext, withUser } from "../context.js";
import { withoutDeletedSessions } from "../tools/get-prs.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 30;

export const prsQuery = z.object({
  since: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * `GET /v1/prs` (#740): PRs set since `since` (default the last 30 days),
 * newest first. Same rows as `get_prs` (live workouts only, #200), shown by
 * the app's rules: estimated-1RM PRs (#389) and reps-at-weight only on
 * bodyweight movements (#354, #705).
 */
export async function v1Prs(
  context: UserContext,
  input: z.infer<typeof prsQuery>,
  now: Date = new Date(),
): Promise<V1Prs> {
  const since = input.since
    ? new Date(input.since)
    : new Date(now.getTime() - DEFAULT_DAYS * DAY_MS);
  return withUser(context, async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, context.userId));
    const units = user?.units ?? "lb";
    const rows = await withoutDeletedSessions(
      tx,
      await tx.select().from(personalRecords).where(isNull(personalRecords.deletedAt)),
    );
    const exerciseIds = [...new Set(rows.map((row) => row.exerciseId))];
    const exerciseRows = exerciseIds.length
      ? await tx.select().from(exercises).where(inArray(exercises.id, exerciseIds))
      : [];
    const exerciseById = new Map(exerciseRows.map((e) => [e.id, e]));
    const repsExerciseIds = repsAtWeightExerciseIds(exerciseRows);
    const visible = rows.filter((row) => isVisiblePr(row, repsExerciseIds));

    const inWindow = visible
      .filter((row) => row.achievedAt >= since)
      .sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime());
    const recent = inWindow.slice(0, input.limit);

    const setIds = recent.flatMap((row) => (row.setId ? [row.setId] : []));
    const sessionBySet = new Map(
      setIds.length
        ? (
            await tx
              .select({ setId: sets.id, sessionId: sessionExercises.sessionId })
              .from(sets)
              .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
              .where(inArray(sets.id, setIds))
          ).map((row) => [row.setId, row.sessionId])
        : [],
    );

    const bodyweight = user?.bodyweight == null ? null : Number(user.bodyweight);
    const profile: StrengthProfile | null =
      user?.sex && bodyweight && bodyweight > 0
        ? {
            sex: user.sex,
            bodyweight,
            age: user.birthdate ? ageFromBirthdate(user.birthdate, now) : null,
          }
        : null;

    return {
      hasMore: inWindow.length > recent.length,
      prs: recent.map((row) => {
        const value = Number(row.value);
        const earlier = visible.filter(
          (other) =>
            other.exerciseId === row.exerciseId &&
            other.kind === row.kind &&
            other.id !== row.id &&
            (other.achievedAt < row.achievedAt ||
              (other.achievedAt.getTime() === row.achievedAt.getTime() &&
                Number(other.value) < value)),
        );
        const previous = earlier.length ? Math.max(...earlier.map((o) => Number(o.value))) : null;
        const exercise = exerciseById.get(row.exerciseId);
        const lift = row.kind === "1rm" ? standardLiftForSlug(exercise?.slug) : null;
        return {
          exerciseId: row.exerciseId,
          exerciseName: exercise?.name ?? "Unknown exercise",
          kind: row.kind,
          value,
          unit: row.kind === "reps_at_weight" ? "reps" : units,
          previousValue: previous,
          achievedAt: row.achievedAt.toISOString(),
          workoutId: (row.setId && sessionBySet.get(row.setId)) ?? null,
          tier: lift && profile ? tierForOneRepMax(lift, value, profile) : null,
        };
      }),
    };
  });
}

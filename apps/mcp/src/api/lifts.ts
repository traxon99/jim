import type { V1Lift, V1Lifts } from "@jim/core";
import { users } from "@jim/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { type UserContext, withUser } from "../context.js";
import { isDatabaseError } from "../tool-error.js";
import { dprStatus } from "../tools/dpr-status.js";
import { exerciseHistory } from "../tools/exercise-history.js";
import { resolvedSetsInRange } from "../tools/volume-report.js";
import { ApiError, notFound } from "./errors.js";
import { dayIn, userZone } from "./zone.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;
const DEFAULT_RANGE_DAYS = 180;
const MOST_TRAINED_WEEKS = 8;
const MOST_TRAINED_COUNT = 4;
const MAX_EXERCISES = 10;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const liftsQuery = z.object({
  exercises: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? [
            ...new Set(
              value
                .split(",")
                .map((id) => id.trim())
                .filter(Boolean),
            ),
          ]
        : undefined,
    )
    .refine((ids) => !ids || ids.length <= MAX_EXERCISES, `At most ${MAX_EXERCISES} exercises`)
    .refine((ids) => !ids || ids.every((id) => UUID_RE.test(id)), "exercises are exercise ids"),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

/** The window, `to` defaulting to now and `from` to 180 days before, at most a year long. */
function range(input: { from?: string; to?: string }, now: Date) {
  const to = input.to ? new Date(input.to) : now;
  const from = input.from
    ? new Date(input.from)
    : new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
  if (from > to) throw new ApiError(400, "bad_request", "from must be before to");
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    throw new ApiError(400, "bad_request", "The range can be at most a year");
  }
  return { from, to };
}

/** PRP focus lifts while a block is running, else the most-trained strength lifts. */
async function defaultLifts(
  context: UserContext,
  now: Date,
): Promise<{ selection: "dpr" | "most_trained"; ids: string[] }> {
  const dpr = await dprStatus(context).catch(() => null);
  if (dpr?.enabled && dpr.block && !dpr.block.ended && dpr.lifts.length) {
    return { selection: "dpr", ids: dpr.lifts.map((lift) => lift.exercise.id) };
  }
  const sets = await withUser(context, (tx) =>
    resolvedSetsInRange(tx, new Date(now.getTime() - MOST_TRAINED_WEEKS * 7 * DAY_MS), now),
  );
  const counts = new Map<string, number>();
  for (const set of sets) counts.set(set.exerciseId, (counts.get(set.exerciseId) ?? 0) + 1);
  const ids = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MOST_TRAINED_COUNT)
    .map(([id]) => id);
  return { selection: "most_trained", ids };
}

/**
 * `GET /v1/lifts` (#740): per lift, the best estimated 1RM per day and the
 * predicted 1RM (#713), from the same `exercise_history` the MCP tool and the
 * app's analysis chart use.
 */
export async function v1Lifts(
  context: UserContext,
  input: z.infer<typeof liftsQuery>,
  now: Date = new Date(),
): Promise<V1Lifts> {
  const { from, to } = range(input, now);
  const picked = input.exercises
    ? { selection: "explicit" as const, ids: input.exercises }
    : await defaultLifts(context, now);
  const [user] = await withUser(context, (tx) =>
    tx
      .select({ units: users.units, timeZone: users.timeZone })
      .from(users)
      .where(eq(users.id, context.userId)),
  );
  const zone = userZone(user?.timeZone);

  const lifts: V1Lift[] = [];
  for (const id of picked.ids) {
    let history: Awaited<ReturnType<typeof exerciseHistory>>;
    try {
      history = await exerciseHistory(context, {
        exercise: id,
        from: from.toISOString(),
        to: to.toISOString(),
      });
    } catch (error) {
      if (picked.selection === "explicit" && error instanceof Error && !isDatabaseError(error)) {
        throw notFound(`No exercise with id ${id}.`);
      }
      throw error;
    }
    const byDay = new Map<string, number>();
    for (const point of history.estimatedOneRepMaxSeries) {
      const day = dayIn(new Date(point.date), zone);
      byDay.set(day, Math.max(byDay.get(day) ?? 0, point.estimatedOneRepMax));
    }
    const points = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, e1rm]) => ({ date, e1rm: round(e1rm) }));
    const prediction = history.predictedOneRepMax;
    lifts.push({
      exerciseId: history.exercise.id,
      name: history.exercise.name,
      points,
      current: points[points.length - 1]?.e1rm ?? null,
      best: points.length ? Math.max(...points.map((p) => p.e1rm)) : null,
      predicted: prediction
        ? {
            value: round(prediction.value),
            confidence: prediction.confidence,
            trendPerWeek: round(prediction.trendPerWeek),
          }
        : null,
    });
  }
  return { units: user?.units ?? "lb", selection: picked.selection, lifts };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

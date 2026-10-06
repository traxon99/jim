import { MEASUREMENT_KINDS, PROGRESSION_TYPES } from "@jim/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { UserContext } from "./context.js";
import { createRoutine } from "./tools/create-routine.js";
import { dprStatus } from "./tools/dpr-status.js";
import { exerciseHistory } from "./tools/exercise-history.js";
import { getBodyMeasurements } from "./tools/get-body-measurements.js";
import { getPrs } from "./tools/get-prs.js";
import { getRoutine } from "./tools/get-routine.js";
import { getWorkout } from "./tools/get-workout.js";
import { listRoutines } from "./tools/list-routines.js";
import { listWorkouts } from "./tools/list-workouts.js";
import { DEFAULT_DURATION_MINUTES, logPastWorkout } from "./tools/log-past-workout.js";
import { mergeExercises } from "./tools/merge-exercises.js";
import { scheduleWorkout } from "./tools/schedule-workout.js";
import { searchExercisesTool } from "./tools/search-exercises.js";
import { updateRoutine } from "./tools/update-routine.js";
import { upsertExercise } from "./tools/upsert-exercise.js";
import { volumeReport } from "./tools/volume-report.js";
import { MAX_SUMMARY_WEEKS, weeklySummary } from "./tools/weekly-summary.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/** Shared by every write tool (#245). `merge_exercises` overrides the default to `true`. */
function dryRunParam(defaultValue: boolean) {
  return z
    .boolean()
    .default(defaultValue)
    .describe(
      "When true, runs every check and returns exactly what would be written (ids are provisional), then rolls back without writing anything. Call with true first, show the user the preview, then call again with false to commit.",
    );
}

const PREVIEW_HINT = " Preview with dry_run: true before committing.";

const repSchemeSchema = z.object({
  sets: z.number().int().positive(),
  reps: z.number().int().positive(),
});

const progressionRuleSchema = z.object({
  type: z
    .enum(PROGRESSION_TYPES)
    .describe(
      "linear: hit the target reps on every set, then add `increment`. double: work up to the top of the rep range on every set, then add `increment` and restart at the bottom. reps_sum: add `increment` once the working sets' reps total `repsSumTarget`.",
    ),
  increment: z.number().positive().describe("Weight added after a success, in the user's units"),
  stages: z
    .array(repSchemeSchema)
    .min(1)
    .optional()
    .describe(
      "linear only: rep schemes to step through on a failed session at the same weight, e.g. GZCLP T1 [5×3, 6×2, 10×1]. Failing the last one counts toward the deload, which returns to the first.",
    ),
  repsSumTarget: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "reps_sum only: total reps to go up, e.g. 55 for GZCLP T3's 3×15+ (25 on the last set). Default sets × top of the rep range.",
    ),
  deload: z
    .object({
      afterFailures: z.number().int().positive(),
      pct: z.number().positive().lt(1).describe("Fraction to drop, e.g. 0.15"),
    })
    .optional()
    .describe("After this many failed sessions in a row, drop the weight by pct"),
});

const routineExerciseSchema = z.object({
  exercise: z.string().describe("Exercise name or id"),
  targetSets: z.number().int().positive().optional(),
  targetRepsLow: z.number().int().positive().optional(),
  targetRepsHigh: z.number().int().positive().optional(),
  targetRestSeconds: z.number().int().nonnegative().optional(),
  targetDurationSeconds: z.number().int().positive().optional(),
  targetWeight: z
    .number()
    .nonnegative()
    .optional()
    .describe("Starting weight, in the user's units"),
  supersetGroup: z.number().int().optional(),
  notes: z.string().optional(),
  progression: progressionRuleSchema
    .nullable()
    .optional()
    .describe(
      "Custom progression rule for this exercise (issue #255); omit or null for none. A lift can't have both a rule and PRP focus: setting a rule on a PRP-focused lift fails.",
    ),
});

/**
 * Builds a fresh `McpServer` bound to one request's already-verified user
 * (see index.ts) — cheap (tool registration is just populating maps), and
 * it keeps every tool's DB access scoped to that one user without threading
 * `extra.authInfo` through every handler.
 */
export function createMcpServer(context: UserContext): McpServer {
  const server = new McpServer({ name: "jim", version: "0.1.0" });

  server.registerTool(
    "list_workouts",
    {
      title: "List workouts",
      description: "Finished workout sessions with summary stats (volume, duration, PR count).",
      inputSchema: {
        from: z.string().datetime().optional().describe("ISO date/time lower bound"),
        to: z.string().datetime().optional().describe("ISO date/time upper bound"),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async (input) => {
      try {
        return json(await listWorkouts(context, input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_workout",
    {
      title: "Get workout",
      description:
        "Full detail for one workout session: every exercise, every set (with rest taken vs target), PRs achieved, and the session's intensity pick.",
      inputSchema: { sessionId: z.string().describe("Session id") },
    },
    async ({ sessionId }) => {
      try {
        return json(await getWorkout(context, sessionId));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "exercise_history",
    {
      title: "Exercise history",
      description:
        "Every set logged for one exercise over time (with rest taken vs target), plus its estimated-1RM series.",
      inputSchema: {
        exercise: z.string().describe("Exercise name or id"),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      },
    },
    async (input) => {
      try {
        return json(await exerciseHistory(context, input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_prs",
    {
      title: "Get personal records",
      description: "Current personal records, optionally filtered by exercise and/or kind.",
      inputSchema: {
        exercise: z.string().optional().describe("Exercise name or id"),
        kind: z.enum(["1rm", "volume", "weight", "reps_at_weight"]).optional(),
      },
    },
    async (input) => {
      try {
        return json(await getPrs(context, input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_body_measurements",
    {
      title: "Get body measurements",
      description:
        "Read-only. Bodyweight, body fat % and circumferences (neck, chest, waist, hips, arms, thighs, calves) logged over time, oldest first, grouped by kind with the latest value and the change across the range. Weights are in the user's units, lengths in inches (lb users) or centimetres (kg users).",
      inputSchema: {
        kinds: z.array(z.enum(MEASUREMENT_KINDS)).optional().describe("Only these kinds"),
        from: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe("ISO date/time lower bound"),
        to: z.string().datetime({ offset: true }).optional().describe("ISO date/time upper bound"),
      },
    },
    async (input) => {
      try {
        return json(await getBodyMeasurements(context, input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_routines",
    {
      title: "List routines",
      description:
        "Read-only. Every routine (program) you have, including ones never logged: id, name, folder, notes, kind (strength or warmup), exercise count, and when it was last performed. Use the id with get_routine, update_routine or schedule_workout.",
      inputSchema: {
        folder: z.string().optional().describe("Only routines in this folder (case-insensitive)"),
        query: z.string().optional().describe("Only routines whose name contains this text"),
      },
    },
    async (input) => {
      try {
        return json(await listRoutines(context, input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_routine",
    {
      title: "Get routine",
      description:
        "Read-only. One routine's template: its exercises in order with target sets, reps, rest, duration, weight, superset group, notes and any custom progression rule. The exercises list is in the shape update_routine accepts, so it can be edited and passed straight back.",
      inputSchema: {
        routine: z.string().describe("Routine id, or its exact name (case-insensitive)"),
      },
    },
    async (input) => {
      try {
        return json(await getRoutine(context, input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "dpr_status",
    {
      title: "PRP status",
      description:
        "Read-only. Whether PR Progression (PRP, formerly DPR) is on, the current training block, and for each focused lift: its rep ranges, PRP's next call (increase / hold / deload / reenter / insufficient) with weight and reason, baseline / current / goal e1RM with on-track status, and the last 5 decisions.",
      inputSchema: {},
    },
    async () => {
      try {
        return json(await dprStatus(context));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "volume_report",
    {
      title: "Volume report",
      description:
        "Training volume grouped by muscle, exercise, or week, over a date range. Counts working sets only (warm-up sets excluded). By muscle, each week also has working sets per muscle (a secondary muscle counts half a set) and whether each muscle is under, within or over the weekly set range for `goal` (strength 5–10 sets, hypertrophy 10–20; default hypertrophy).",
      inputSchema: {
        groupBy: z.enum(["muscle", "exercise", "week"]),
        from: z.string().datetime(),
        to: z.string().datetime(),
        goal: z.enum(["strength", "hypertrophy"]).optional(),
      },
    },
    async (input) => {
      try {
        return json(await volumeReport(context, input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "weekly_summary",
    {
      title: "Weekly summary",
      description:
        "Read-only. What was done in a training week (weeks start on the user's chosen week-start day): workouts, working sets and total volume (weight × reps), working sets and volume per muscle checked against the weekly set range for `goal` (strength 5–10, hypertrophy 10–20; default hypertrophy; a secondary muscle counts half a set), and sets and volume per exercise. Working sets only: warm-up sets and warm-up exercises are left out. Defaults to the current week; pass `weeks` to also get the weeks before it, newest first.",
      inputSchema: {
        date: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe("Any date/time inside the week to summarize (default: now)"),
        weeks: z
          .number()
          .int()
          .min(1)
          .max(MAX_SUMMARY_WEEKS)
          .optional()
          .describe("How many weeks to return, ending with the week of `date` (default 1)"),
        goal: z.enum(["strength", "hypertrophy"]).optional(),
      },
    },
    async (input) => {
      try {
        return json(await weeklySummary(context, input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "search_exercises",
    {
      title: "Search exercises",
      description: "Search the exercise catalog by name/alias, muscle group, and/or equipment.",
      inputSchema: {
        query: z.string().optional(),
        muscles: z.array(z.string()).optional(),
        equipment: z.string().optional(),
      },
    },
    async (input) => {
      try {
        return json(await searchExercisesTool(context, input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "create_routine",
    {
      title: "Create routine",
      description: `Build a new routine (program) with an ordered list of exercises and targets.${PREVIEW_HINT}`,
      inputSchema: {
        name: z.string(),
        folder: z.string().optional(),
        exercises: z.array(routineExerciseSchema),
        dry_run: dryRunParam(false),
      },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await createRoutine(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "update_routine",
    {
      title: "Update routine",
      description: `Amend a routine's name/folder/notes, and/or replace its entire exercise list (the result counts how many existing exercises were replaced).${PREVIEW_HINT}`,
      inputSchema: {
        routineId: z.string(),
        name: z.string().optional(),
        folder: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        exercises: z.array(routineExerciseSchema).optional(),
        dry_run: dryRunParam(false),
      },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await updateRoutine(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "schedule_workout",
    {
      title: "Schedule workout",
      description: `Plan a future session from a routine, for a given date.${PREVIEW_HINT}`,
      inputSchema: {
        routineId: z.string(),
        date: z.string().datetime(),
        notes: z.string().optional(),
        dry_run: dryRunParam(false),
      },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await scheduleWorkout(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "log_past_workout",
    {
      title: "Log past workout",
      description: `Record a workout that has already finished (e.g. one done without the phone), with its exercises and sets. The session is created already finished, so it shows up in History after the phone's next sync and counts toward PRs, volume and PRP like any other workout. It can never start, change or end a workout that is in progress on the phone. PRs are detected against every set logged before this workout.${PREVIEW_HINT}`,
      inputSchema: {
        startedAt: z.string().datetime({ offset: true }).describe("When the workout started"),
        durationMinutes: z
          .number()
          .positive()
          .max(24 * 60)
          .optional()
          .describe(
            `How long it lasted (default ${DEFAULT_DURATION_MINUTES}). Must end in the past.`,
          ),
        name: z.string().optional().describe("Defaults to the routine's name, if one is given"),
        routineId: z.string().optional().describe("The routine this workout followed, if any"),
        notes: z.string().optional(),
        bodyweight: z.number().positive().optional(),
        exercises: z
          .array(
            z.object({
              exercise: z.string().describe("Exercise name or id"),
              notes: z.string().optional(),
              sets: z
                .array(
                  z.object({
                    weight: z.number().nonnegative().optional().describe("In the user's units"),
                    reps: z.number().int().nonnegative().optional(),
                    rpe: z.number().min(1).max(10).optional(),
                    rir: z.number().int().nonnegative().optional(),
                    durationSeconds: z.number().int().positive().optional(),
                    distance: z.number().nonnegative().optional(),
                    kind: z.enum(["warmup", "working", "drop", "failure"]).optional(),
                  }),
                )
                .min(1),
            }),
          )
          .min(1),
        dry_run: dryRunParam(false),
      },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await logPastWorkout(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "upsert_exercise",
    {
      title: "Upsert exercise",
      description: `Create a custom exercise, or edit one (editing a global catalog exercise clones it into your own copy, ADR-008).${PREVIEW_HINT}`,
      inputSchema: {
        id: z.string().optional().describe("Omit to create a new exercise"),
        name: z.string().optional(),
        aliases: z.array(z.string()).optional(),
        primaryMuscles: z.array(z.string()).optional(),
        secondaryMuscles: z.array(z.string()).optional(),
        equipment: z.string().optional(),
        mechanic: z.enum(["compound", "isolation"]).optional(),
        force: z.enum(["push", "pull", "static"]).optional(),
        level: z.enum(["beginner", "intermediate", "expert"]).optional(),
        trackingType: z
          .enum([
            "weight_reps",
            "time",
            "distance",
            "bodyweight",
            "weighted_bodyweight",
            "distance_time",
          ])
          .optional(),
        instructions: z.array(z.string()).optional(),
        isArchived: z.boolean().optional(),
        dry_run: dryRunParam(false),
      },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await upsertExercise(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "merge_exercises",
    {
      title: "Merge exercises",
      description:
        "Repoints every historical reference from mergeId to keepId and archives mergeId, without orphaning any set. Hard to undo, so dry_run defaults to true: the first call only reports how many session exercises, routine exercises and PRs would be repointed. Show that to the user and call again with dry_run: false to actually merge.",
      inputSchema: { keepId: z.string(), mergeId: z.string(), dry_run: dryRunParam(true) },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await mergeExercises(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

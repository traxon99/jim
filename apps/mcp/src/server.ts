import { MEASUREMENT_KINDS, PROGRESSION_TYPES } from "@jim/core";
import {
  accentColorEnum,
  cardStyleEnum,
  colorSchemeEnum,
  dprAggressivenessEnum,
  dprExperienceEnum,
  fontFamilyEnum,
  sexEnum,
} from "@jim/db";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { UserContext } from "./context.js";
import { deleteBodyMeasurement, logBodyMeasurement } from "./tools/body-measurements-write.js";
import { createRoutine } from "./tools/create-routine.js";
import { deleteRoutine } from "./tools/delete-routine.js";
import { deleteWorkout } from "./tools/delete-workout.js";
import { dprStatus } from "./tools/dpr-status.js";
import { exerciseHistory } from "./tools/exercise-history.js";
import { getBodyMeasurements } from "./tools/get-body-measurements.js";
import { getPrs } from "./tools/get-prs.js";
import { getRoutine } from "./tools/get-routine.js";
import { getWorkout } from "./tools/get-workout.js";
import { createGym, deleteGym, listGyms, updateGym } from "./tools/gyms.js";
import { listRoutines } from "./tools/list-routines.js";
import { listWorkouts } from "./tools/list-workouts.js";
import { DEFAULT_DURATION_MINUTES, logPastWorkout } from "./tools/log-past-workout.js";
import { mergeExercises } from "./tools/merge-exercises.js";
import { createProgram, deleteProgram, listPrograms, updateProgram } from "./tools/programs.js";
import { scheduleWorkout } from "./tools/schedule-workout.js";
import { cancelScheduledWorkout, listScheduledWorkouts } from "./tools/scheduled-workouts.js";
import { searchExercisesTool } from "./tools/search-exercises.js";
import { getSettings, updateSettings } from "./tools/settings.js";
import { updateRoutine } from "./tools/update-routine.js";
import { upsertExercise } from "./tools/upsert-exercise.js";
import { volumeReport } from "./tools/volume-report.js";
import { createWarmup, listWarmupTemplates } from "./tools/warmups.js";
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
      description:
        "Finished workout sessions with summary stats (volume, duration, PR count) and the gym each was at.",
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
        "Full detail for one workout session: every exercise, every set (with rest taken vs target), PRs achieved, the session's intensity pick and the gym it was at.",
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
        "Read-only. Every routine and warm-up you have, including ones never logged: id, name, folder, notes, kind (strength or warmup), the linked warm-up's id, exercise count, and when it was last performed. Use the id with get_routine, update_routine or schedule_workout.",
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
      description:
        "Search the exercise catalog by name/alias or machine make/model, muscle group, and/or equipment. Results include machine make/model, pulley type and gym when set.",
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
      description: `Build a new strength routine with an ordered list of exercises and targets. For a warm-up, use create_warmup instead.${PREVIEW_HINT}`,
      inputSchema: {
        name: z.string(),
        folder: z.string().optional(),
        notes: z.string().optional(),
        warmup: z
          .string()
          .optional()
          .describe("A warm-up routine (id or name) that runs before this routine"),
        warmupMinutes: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Warm-up timer length for this routine; defaults to the warm-up's own"),
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
      description: `Amend a routine or warm-up: its name/folder/notes, its linked warm-up and warm-up timer, and/or replace its entire exercise list (the result counts how many existing exercises were replaced).${PREVIEW_HINT}`,
      inputSchema: {
        routineId: z.string().describe("Routine id, or its exact name"),
        name: z.string().optional(),
        folder: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        warmup: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Warm-up routine (id or name) to run before this one; null unlinks it. Strength routines only.",
          ),
        warmupMinutes: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional()
          .describe("Warm-up timer length in minutes; null clears it"),
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
        gym: z
          .string()
          .optional()
          .describe("The gym it was at, by name or id from list_gyms; none when omitted"),
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
        machineBrand: z
          .string()
          .optional()
          .describe("Machine make, e.g. Hammer Strength. Empty clears"),
        machineModel: z.string().optional().describe("Machine model. Empty clears"),
        pulleyType: z
          .enum(["single", "double", "none"])
          .optional()
          .describe("Cable machine pulley setup; none = not a cable machine"),
        gym: z
          .string()
          .optional()
          .describe("Gym id or exact name (see list_gyms) the machine is at. Empty clears"),
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

  server.registerTool(
    "delete_routine",
    {
      title: "Delete routine",
      description: `Delete a routine or warm-up, as the phone's Delete button does. Past workouts built from it are unaffected. Hard to undo from the phone, so dry_run defaults to true: confirm with the user, then call again with dry_run: false.`,
      inputSchema: {
        routine: z.string().describe("Routine id, or its exact name"),
        dry_run: dryRunParam(true),
      },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await deleteRoutine(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_warmup_templates",
    {
      title: "List warm-up templates",
      description:
        "Read-only. The built-in warm-up templates the phone offers (full body, legs, upper body, full-body stretch): key, name, timer minutes and exercises. Pass a key to create_warmup to add one.",
      inputSchema: {},
    },
    async () => {
      try {
        return json(await listWarmupTemplates(context));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "create_warmup",
    {
      title: "Create warm-up",
      description: `Create a warm-up: a routine of kind "warmup" whose exercises run as the timed warm-up block before any routine it's linked to, and never count toward working volume or PRs. Either add a built-in template by key (see list_warmup_templates) or give a custom exercise list, each with sets and reps or seconds. attachTo links it to strength routines straight away (or use update_routine's warmup later).${PREVIEW_HINT}`,
      inputSchema: {
        template: z.string().optional().describe("Built-in template key, e.g. full-body"),
        name: z.string().optional().describe("Required for a custom warm-up"),
        notes: z.string().optional(),
        minutes: z.number().int().positive().optional().describe("Warm-up timer length"),
        folder: z.string().optional(),
        exercises: z
          .array(
            z.object({
              exercise: z.string().describe("Exercise name or id"),
              sets: z.number().int().positive().optional().describe("Default 1"),
              reps: z.number().int().positive().optional(),
              seconds: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Hold or work time per set; give this or reps"),
              notes: z.string().optional(),
            }),
          )
          .optional(),
        attachTo: z
          .array(z.string())
          .optional()
          .describe("Strength routines (ids or names) that should run this warm-up first"),
        dry_run: dryRunParam(false),
      },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await createWarmup(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  const programEntrySchema = z.object({
    routine: z
      .string()
      .nullable()
      .optional()
      .describe("Routine id or name; omit or null for a rest day"),
    weekday: z
      .number()
      .int()
      .min(0)
      .max(6)
      .optional()
      .describe("0 = Sunday .. 6 = Saturday; required in weekly mode"),
  });

  server.registerTool(
    "list_programs",
    {
      title: "List programs",
      description:
        "Read-only. Every program: a rotating sequence (next = the one after the last completed) or a weekly schedule (each routine pinned to a weekday). Shows which one is active, its entries in order (rest days included), and week N of M for one with a planned length.",
      inputSchema: {},
    },
    async () => {
      try {
        return json(await listPrograms(context));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "create_program",
    {
      title: "Create program",
      description: `Create a program from existing routines, as a rotating sequence or a weekly schedule. activate: true makes it the one active program, which the phone's Workout tab suggests from.${PREVIEW_HINT}`,
      inputSchema: {
        name: z.string(),
        mode: z.enum(["sequence", "weekly"]).optional().describe("Default sequence"),
        notes: z.string().optional(),
        durationWeeks: z.number().int().positive().optional().describe("Planned length"),
        entries: z.array(programEntrySchema),
        activate: z.boolean().optional(),
        dry_run: dryRunParam(false),
      },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await createProgram(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "update_program",
    {
      title: "Update program",
      description: `Rename a program, change its mode, notes or planned length, replace its entries, or make it active (active: true; any other active program is switched off) or inactive.${PREVIEW_HINT}`,
      inputSchema: {
        program: z.string().describe("Program id, or its exact name"),
        name: z.string().optional(),
        mode: z.enum(["sequence", "weekly"]).optional(),
        notes: z.string().nullable().optional(),
        durationWeeks: z.number().int().positive().nullable().optional(),
        entries: z.array(programEntrySchema).optional().describe("Replaces every entry"),
        active: z.boolean().optional(),
        dry_run: dryRunParam(false),
      },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await updateProgram(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "delete_program",
    {
      title: "Delete program",
      description:
        "Delete a program. Its routines and past workouts are unaffected. dry_run defaults to true: confirm with the user, then call again with dry_run: false.",
      inputSchema: {
        program: z.string().describe("Program id, or its exact name"),
        dry_run: dryRunParam(true),
      },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await deleteProgram(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_scheduled_workouts",
    {
      title: "List scheduled workouts",
      description:
        "Read-only. Workouts planned with schedule_workout, soonest first. Upcoming only unless includePast.",
      inputSchema: { includePast: z.boolean().optional() },
    },
    async (input) => {
      try {
        return json(await listScheduledWorkouts(context, input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "cancel_scheduled_workout",
    {
      title: "Cancel scheduled workout",
      description: `Remove a planned workout (id from list_scheduled_workouts).${PREVIEW_HINT}`,
      inputSchema: { id: z.string(), dry_run: dryRunParam(false) },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await cancelScheduledWorkout(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "delete_workout",
    {
      title: "Delete workout",
      description:
        "Delete a finished workout from history, as the phone's Delete workout does: it drops out of History, PRs, volume and PRP. A workout still in progress is refused. Can't be undone on the phone, so dry_run defaults to true: confirm with the user, then call again with dry_run: false.",
      inputSchema: {
        sessionId: z.string().describe("Workout id from list_workouts"),
        dry_run: dryRunParam(true),
      },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await deleteWorkout(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "log_body_measurement",
    {
      title: "Log body measurement",
      description: `Log a weigh-in, body fat % or a circumference. One entry per kind per day, like the phone: logging the same kind again that day updates it. A weigh-in that becomes the latest also updates the profile's current bodyweight.${PREVIEW_HINT}`,
      inputSchema: {
        kind: z.enum(MEASUREMENT_KINDS),
        value: z.number().positive(),
        unit: z
          .enum(["lb", "kg", "in", "cm", "pct"])
          .optional()
          .describe("Default: what the phone shows this kind in for the user's units"),
        measuredAt: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe("Default now. Include the user's UTC offset so it lands on the right day"),
        dry_run: dryRunParam(false),
      },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await logBodyMeasurement(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "delete_body_measurement",
    {
      title: "Delete body measurement",
      description: `Delete one measurement entry (its id from get_body_measurements).${PREVIEW_HINT}`,
      inputSchema: { id: z.string(), dry_run: dryRunParam(false) },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await deleteBodyMeasurement(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_gyms",
    {
      title: "List gyms",
      description:
        "Read-only. The gyms the user trains at, home gym first, with each one's address and notes.",
      inputSchema: {},
    },
    async () => {
      try {
        return json(await listGyms(context));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "create_gym",
    {
      title: "Create gym",
      description: `Add a gym the user trains at. The first gym becomes the home gym; pass makeHome to make a later one home.${PREVIEW_HINT}`,
      inputSchema: {
        name: z.string(),
        address: z.string().optional(),
        notes: z.string().optional(),
        makeHome: z.boolean().optional().describe("Make this the home gym"),
        dry_run: dryRunParam(false),
      },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await createGym(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "update_gym",
    {
      title: "Update gym",
      description: `Rename a gym, change its address or notes, or make it the home gym. Omitted fields stay as they are; an empty string clears address or notes.${PREVIEW_HINT}`,
      inputSchema: {
        gym: z.string().describe("Gym id, or its exact name"),
        name: z.string().optional(),
        address: z.string().optional(),
        notes: z.string().optional(),
        makeHome: z.boolean().optional().describe("true makes this the home gym"),
        dry_run: dryRunParam(false),
      },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await updateGym(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "delete_gym",
    {
      title: "Delete gym",
      description:
        "Delete a gym. If it was the home gym, the next gym becomes home. dry_run defaults to true: confirm with the user, then call again with dry_run: false.",
      inputSchema: {
        gym: z.string().describe("Gym id, or its exact name"),
        dry_run: dryRunParam(true),
      },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await deleteGym(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_settings",
    {
      title: "Get settings",
      description:
        "Read-only. The user's settings: units, bar weight, plates, default rest, week start, appearance, profile (sex, birthdate, height, bodyweight) and PR Progression (PRP, stored as dpr*) options.",
      inputSchema: {},
    },
    async () => {
      try {
        return json(await getSettings(context));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "update_settings",
    {
      title: "Update settings",
      description: `Change any of the settings get_settings returns; only the fields given change. Changing units only changes how weights are shown and entered. The phone picks changes up the next time the app is opened fresh.${PREVIEW_HINT}`,
      inputSchema: {
        units: z.enum(["lb", "kg"]).optional(),
        defaultBarWeight: z.number().positive().optional(),
        availablePlates: z.array(z.number().positive()).min(1).optional(),
        defaultRestSeconds: z.number().int().nonnegative().optional(),
        weekStart: z.number().int().min(0).max(6).optional().describe("0 = Sunday .. 6 = Saturday"),
        colorScheme: z.enum(colorSchemeEnum.enumValues).optional(),
        accentColor: z.enum(accentColorEnum.enumValues).optional(),
        fontFamily: z.enum(fontFamilyEnum.enumValues).optional(),
        cardStyle: z.enum(cardStyleEnum.enumValues).optional(),
        showPaceTracker: z.boolean().optional(),
        sex: z.enum(sexEnum.enumValues).nullable().optional(),
        birthdate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional()
          .describe("YYYY-MM-DD"),
        heightCm: z.number().positive().nullable().optional(),
        bodyweight: z.number().positive().nullable().optional().describe("In the user's units"),
        dprEnabled: z.boolean().optional().describe("Turns PR Progression (PRP) on or off"),
        dprAggressiveness: z.enum(dprAggressivenessEnum.enumValues).optional(),
        dprExperience: z.enum(dprExperienceEnum.enumValues).nullable().optional(),
        dprDefaultRepLow: z.number().int().min(1).max(100).optional(),
        dprDefaultRepHigh: z.number().int().min(1).max(100).optional(),
        dry_run: dryRunParam(false),
      },
    },
    async ({ dry_run, ...input }) => {
      try {
        return json(await updateSettings(context, { ...input, dryRun: dry_run }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

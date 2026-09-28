import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { UserContext } from "./context.js";
import { createRoutine } from "./tools/create-routine.js";
import { dprStatus } from "./tools/dpr-status.js";
import { exerciseHistory } from "./tools/exercise-history.js";
import { getPrs } from "./tools/get-prs.js";
import { getWorkout } from "./tools/get-workout.js";
import { listWorkouts } from "./tools/list-workouts.js";
import { mergeExercises } from "./tools/merge-exercises.js";
import { scheduleWorkout } from "./tools/schedule-workout.js";
import { searchExercisesTool } from "./tools/search-exercises.js";
import { updateRoutine } from "./tools/update-routine.js";
import { upsertExercise } from "./tools/upsert-exercise.js";
import { volumeReport } from "./tools/volume-report.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

const routineExerciseSchema = z.object({
  exercise: z.string().describe("Exercise name or id"),
  targetSets: z.number().int().positive().optional(),
  targetRepsLow: z.number().int().positive().optional(),
  targetRepsHigh: z.number().int().positive().optional(),
  targetRestSeconds: z.number().int().nonnegative().optional(),
  supersetGroup: z.number().int().optional(),
  notes: z.string().optional(),
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
    "dpr_status",
    {
      title: "Dynamic Progression status",
      description:
        "Read-only. Whether Dynamic Progression (DPR) is on, the current training block, and for each focused lift: its rep ranges, DPR's next call (increase / hold / deload / reenter / insufficient) with weight and reason, baseline / current / goal e1RM with on-track status, and the last 5 decisions.",
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
      description: "Training volume grouped by muscle, exercise, or week, over a date range.",
      inputSchema: {
        groupBy: z.enum(["muscle", "exercise", "week"]),
        from: z.string().datetime(),
        to: z.string().datetime(),
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
      description: "Build a new routine (program) with an ordered list of exercises and targets.",
      inputSchema: {
        name: z.string(),
        folder: z.string().optional(),
        exercises: z.array(routineExerciseSchema),
      },
    },
    async (input) => {
      try {
        return json(await createRoutine(context, input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "update_routine",
    {
      title: "Update routine",
      description: "Amend a routine's name/folder/notes, and/or replace its entire exercise list.",
      inputSchema: {
        routineId: z.string(),
        name: z.string().optional(),
        folder: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        exercises: z.array(routineExerciseSchema).optional(),
      },
    },
    async (input) => {
      try {
        return json(await updateRoutine(context, input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "schedule_workout",
    {
      title: "Schedule workout",
      description: "Plan a future session from a routine, for a given date.",
      inputSchema: {
        routineId: z.string(),
        date: z.string().datetime(),
        notes: z.string().optional(),
      },
    },
    async (input) => {
      try {
        return json(await scheduleWorkout(context, input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "upsert_exercise",
    {
      title: "Upsert exercise",
      description:
        "Create a custom exercise, or edit one (editing a global catalog exercise clones it into your own copy, ADR-008).",
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
          .enum(["weight_reps", "time", "distance", "bodyweight", "weighted_bodyweight"])
          .optional(),
        instructions: z.array(z.string()).optional(),
        isArchived: z.boolean().optional(),
      },
    },
    async (input) => {
      try {
        return json(await upsertExercise(context, input));
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
        "Repoints every historical reference from mergeId to keepId and archives mergeId, without orphaning any set.",
      inputSchema: { keepId: z.string(), mergeId: z.string() },
    },
    async (input) => {
      try {
        return json(await mergeExercises(context, input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

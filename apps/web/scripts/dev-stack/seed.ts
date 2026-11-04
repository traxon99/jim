import { readFileSync } from "node:fs";
import { type Db, createDb, friendships, posts, routines, users, workoutReactions } from "@jim/db";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { seedCatalog } from "../../../../packages/db/src/seed/index";
import { createRoutine } from "../../../mcp/src/tools/create-routine";
import { logPastWorkout } from "../../../mcp/src/tools/log-past-workout";
import type { DevUser } from "./fake-auth";
import { assertLocal } from "./postgres";

/**
 * Resets the dev database and fills it with a signed-up, onboarded user who
 * has a routine and three weeks of history. Workouts and the routine go in
 * through the MCP server's own tools, so they're shaped exactly like data the
 * app syncs (same sets, PRs and server_seq), not hand-written rows.
 */

const BOOTSTRAP_SQL = readFileSync(
  new URL("../../../../packages/db/test/bootstrap-supabase-stubs.sql", import.meta.url),
  "utf8",
);
const MIGRATIONS_FOLDER = new URL("../../../../packages/db/drizzle", import.meta.url).pathname;

export const DEV_USER: DevUser = {
  id: "00000000-0000-4000-8000-000000000de0",
  email: "dev@jim.test",
  password: "jim-dev-password",
};

const PUSH_DAY = [
  { exercise: "Barbell Bench Press", sets: 3, weight: 185, reps: 8 },
  { exercise: "Incline Dumbbell Press", sets: 3, weight: 60, reps: 10 },
  { exercise: "Overhead Press", sets: 3, weight: 105, reps: 8 },
  { exercise: "Triceps Pushdown", sets: 3, weight: 50, reps: 12 },
];

export async function seedDevDatabase(databaseUrl: string) {
  assertLocal(databaseUrl);
  const admin = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await admin.unsafe("CREATE SCHEMA public");
    await admin.unsafe("DROP SCHEMA IF EXISTS auth CASCADE");
    await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await admin.unsafe(BOOTSTRAP_SQL);
    await migrate(drizzle(admin), { migrationsFolder: MIGRATIONS_FOLDER });
    await admin`insert into auth.users (id, email) values (${DEV_USER.id}, ${DEV_USER.email})`;
  } finally {
    await admin.end();
  }

  const { count } = await seedCatalog(databaseUrl);

  const db = createDb(databaseUrl);
  try {
    // Signed up and through the setup walkthrough, so the app opens on Train.
    await db.insert(users).values({ id: DEV_USER.id, email: DEV_USER.email }).onConflictDoNothing();
    await db
      .update(users)
      .set({ onboardedAt: new Date(), timeZone: "America/Los_Angeles", bodyweight: "180" })
      .where(eq(users.id, DEV_USER.id));

    const context = { db, userId: DEV_USER.id, email: DEV_USER.email };
    const routine = await createRoutine(context, {
      name: "Push Day",
      exercises: PUSH_DAY.map((lift) => ({
        exercise: lift.exercise,
        targetSets: lift.sets,
        targetRepsLow: lift.reps - 2,
        targetRepsHigh: lift.reps + 2,
        targetWeight: lift.weight,
      })),
    });

    // Six workouts over three weeks, adding a little weight each time.
    for (let i = 0; i < 6; i++) {
      const daysAgo = 21 - i * 3.5;
      const startedAt = new Date(Date.now() - daysAgo * 86_400_000);
      startedAt.setUTCHours(1, 30, 0, 0);
      await logPastWorkout(context, {
        startedAt: startedAt.toISOString(),
        durationMinutes: 55,
        name: "Push Day",
        routineId: routine.id,
        exercises: PUSH_DAY.map((lift) => ({
          exercise: lift.exercise,
          sets: Array.from({ length: lift.sets }, (_, set) => ({
            weight: lift.weight - 10 + i * 2.5,
            reps: lift.reps - (set === lift.sets - 1 ? 1 : 0),
            rpe: 7 + (set === lift.sets - 1 ? 1 : 0),
          })),
        })),
      });
    }
    await seedFriends(db);
    return { exercises: count, workouts: 6 };
  } finally {
    await db.$client.end();
  }
}

/**
 * Three friends with recent workouts, a shared record and some reactions, so
 * the Home feed, week rings and profiles have something to show (issue #746).
 * They can't sign in; the fake auth only knows DEV_USER.
 */
const FRIENDS = [
  { id: "00000000-0000-4000-8000-0000000f0001", username: "maya", color: "orange" },
  { id: "00000000-0000-4000-8000-0000000f0002", username: "theo", color: "blue" },
  { id: "00000000-0000-4000-8000-0000000f0003", username: "sam.lifts", color: "indigo" },
] as const;

async function seedFriends(db: Db) {
  for (const [index, friend] of FRIENDS.entries()) {
    const email = `${friend.username}@jim.test`;
    await db.execute(sql`insert into auth.users (id, email) values (${friend.id}, ${email})`);
    await db.insert(users).values({ id: friend.id, email, username: friend.username });
    await db.insert(friendships).values({
      requesterId: DEV_USER.id,
      addresseeId: friend.id,
      status: "accepted",
      acceptedAt: new Date(),
    });

    const context = { db, userId: friend.id, email };
    const routine = await createRoutine(context, {
      name: "Push Day",
      exercises: PUSH_DAY.map((lift) => ({ exercise: lift.exercise, targetSets: lift.sets })),
    });
    await db.update(routines).set({ iconColor: friend.color }).where(eq(routines.id, routine.id));

    // A workout a few hours ago, and one each earlier this week and last.
    for (const hoursAgo of [2 + index * 5, 50 + index * 7, 170]) {
      const startedAt = new Date(Date.now() - hoursAgo * 3_600_000);
      await logPastWorkout(context, {
        startedAt: startedAt.toISOString(),
        durationMinutes: 50 + index * 4,
        name: "Push Day",
        routineId: routine.id,
        exercises: PUSH_DAY.map((lift) => ({
          exercise: lift.exercise,
          sets: Array.from({ length: lift.sets + 1 }, () => ({
            weight: lift.weight + 20 - index * 10 + (hoursAgo < 24 ? 10 : 0),
            reps: lift.reps,
          })),
        })),
      });
    }
  }

  const [sam] = FRIENDS.slice(2);
  if (sam) {
    await db.insert(posts).values({
      userId: sam.id,
      kind: "record",
      title: "Deadlift",
      detail: "Estimated 1RM · 405 lb",
      caption: "Four plates. Finally.",
      createdAt: new Date(Date.now() - 3 * 3_600_000),
    });
  }

  // Friends reacting to the dev user's latest workout, and the dev user to maya's.
  const [latest] = await db.execute<{ id: string }>(
    sql`select id from sessions where user_id = ${DEV_USER.id} order by started_at desc limit 1`,
  );
  if (latest) {
    for (const [index, friend] of FRIENDS.entries()) {
      await db.insert(workoutReactions).values({
        sessionId: latest.id,
        userId: friend.id,
        kind: index === 0 ? "fire" : "strong",
      });
    }
  }
}

import { MUSCLES } from "@jim/core";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  type PgColumn,
  bigint,
  boolean,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgPolicy,
  pgSequence,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authUid, authUsers, authenticatedRole } from "drizzle-orm/supabase";

// ---------------------------------------------------------------------------
// Sync sequence — one shared, strictly increasing cursor across every
// syncable table, so GET /api/sync/pull?since=<server_seq> can take a single
// scalar cursor rather than a per-table one (see docs/ARCHITECTURE.md §3).
// ---------------------------------------------------------------------------

export const syncSeq = pgSequence("sync_seq");
const nextSyncSeq = sql`nextval('sync_seq')`;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const unitsEnum = pgEnum("units", ["lb", "kg"]);

export const colorSchemeEnum = pgEnum("color_scheme", ["system", "light", "dark"]);

export const accentColorEnum = pgEnum("accent_color", [
  "zinc",
  "blue",
  "green",
  "purple",
  "orange",
  "rose",
]);

export const fontFamilyEnum = pgEnum("font_family", ["sans", "serif", "mono"]);

// Biological sex, used to select the correct strength-standards table (see
// packages/core's strength-standards module) — not a broader identity field.
export const sexEnum = pgEnum("sex", ["male", "female"]);

// The controlled vocabulary this seed data ships with (see ADR-008). Sourced
// from free-exercise-db, which already uses a small, consistent muscle list.
// Lives in @jim/core (see its exercises/muscles.ts) so client-side UI can
// import the same list without pulling this package's Postgres client code
// into a browser bundle.
export const muscleEnum = pgEnum("muscle", [...MUSCLES]);

export const mechanicEnum = pgEnum("mechanic", ["compound", "isolation"]);
export const forceEnum = pgEnum("force", ["push", "pull", "static"]);
export const levelEnum = pgEnum("level", ["beginner", "intermediate", "expert"]);

export const trackingTypeEnum = pgEnum("tracking_type", [
  "weight_reps",
  "time",
  "distance",
  "bodyweight",
  "weighted_bodyweight",
]);

// Warm-ups/stretches (issue #59) are exercises like any other, but live in
// their own category: they're logged for reps or time, tracked for how often
// they're done rather than for PRs/volume, and grouped at the start of a
// workout.
export const exerciseCategoryEnum = pgEnum("exercise_category", ["strength", "warmup"]);

// A "warmup" routine is a reusable warm-up block (e.g. "Leg warm-up") that a
// strength routine can link to as its warm-up (routines.warmup_routine_id).
export const routineKindEnum = pgEnum("routine_kind", ["strength", "warmup"]);

export const setKindEnum = pgEnum("set_kind", ["warmup", "working", "drop", "failure"]);

export const prKindEnum = pgEnum("pr_kind", ["1rm", "volume", "weight", "reps_at_weight"]);

export const programModeEnum = pgEnum("program_mode", ["sequence", "weekly"]);

// ---------------------------------------------------------------------------
// users — mirrors auth.users; row is created for a user on first sign-in
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    // settings
    units: unitsEnum("units").notNull().default("lb"),
    defaultBarWeight: numeric("default_bar_weight", { precision: 6, scale: 2 })
      .notNull()
      .default("45"),
    availablePlates: numeric("available_plates", { precision: 6, scale: 2 })
      .array()
      .notNull()
      .default(sql`ARRAY[45, 35, 25, 10, 5, 2.5]::numeric[]`),
    defaultRestSeconds: integer("default_rest_seconds").notNull().default(90),
    // 0 = Sunday .. 6 = Saturday
    weekStart: smallint("week_start").notNull().default(0),
    // "system" follows the OS/browser's prefers-color-scheme; "light"/"dark" override it.
    colorScheme: colorSchemeEnum("color_scheme").notNull().default("system"),
    // The app's primary/interactive accent color, independent of light/dark. "zinc" keeps
    // the original monochrome look (accent tracks the foreground/background pair).
    accentColor: accentColorEnum("accent_color").notNull().default("zinc"),
    // The app's body typeface. "sans" keeps the original system sans-serif look.
    fontFamily: fontFamilyEnum("font_family").notNull().default("sans"),

    // Profile fields feeding the strength-standards lookup (packages/core):
    // sex and bodyweight select the standards table, age adjusts it. All
    // nullable — the feature degrades to "no standard shown" without them,
    // rather than forcing profile completion. `bodyweight` is a single
    // current value in the user's `units`, distinct from the `body_measurements`
    // time series (which nothing in the app reads or writes yet).
    sex: sexEnum("sex"),
    birthdate: date("birthdate"),
    heightCm: numeric("height_cm", { precision: 5, scale: 1 }),
    bodyweight: numeric("bodyweight", { precision: 6, scale: 2 }),
  },
  (table) => [
    pgPolicy("users_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.id} = ${authUid}`,
    }),
    pgPolicy("users_insert_own", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${table.id} = ${authUid}`,
    }),
    pgPolicy("users_update_own", {
      for: "update",
      to: authenticatedRole,
      using: sql`${table.id} = ${authUid}`,
      withCheck: sql`${table.id} = ${authUid}`,
    }),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// exercises — global seed rows (owner_id IS NULL) + user-owned clones (ADR-008)
// ---------------------------------------------------------------------------

export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    // Stable key for the seed script's idempotent upsert (see ADR-008); not
    // part of the app-facing model. Only meaningful while owner_id IS NULL.
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    aliases: text("aliases").array().notNull().default(sql`ARRAY[]::text[]`),
    primaryMuscles: muscleEnum("primary_muscles").array().notNull().default(sql`ARRAY[]::muscle[]`),
    secondaryMuscles: muscleEnum("secondary_muscles")
      .array()
      .notNull()
      .default(sql`ARRAY[]::muscle[]`),
    equipment: text("equipment"),
    mechanic: mechanicEnum("mechanic"),
    force: forceEnum("force"),
    level: levelEnum("level"),
    trackingType: trackingTypeEnum("tracking_type").notNull(),
    category: exerciseCategoryEnum("category").notNull().default("strength"),
    instructions: text("instructions").array().notNull().default(sql`ARRAY[]::text[]`),
    imageUrls: text("image_urls").array().notNull().default(sql`ARRAY[]::text[]`),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Sync bookkeeping (S4): user-owned rows (custom or cloned, ADR-008) are
    // LWW like every other table. Global seed rows never round-trip through
    // push, so device_id is meaningless for them — only ever read/written
    // for owner_id IS NOT NULL rows.
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deviceId: text("device_id").notNull().default(""),
    serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(nextSyncSeq),
  },
  (table) => [
    // Global rows are reseeded by slug; a user may separately own a row with
    // the same slug (their copy-on-write clone), so the index only covers
    // owner_id IS NULL rather than being a plain unique(slug).
    uniqueIndex("exercises_global_slug")
      .on(table.slug)
      .where(sql`${table.ownerId} IS NULL`),
    index("exercises_server_seq").on(table.serverSeq),
    pgPolicy("exercises_select_own_or_global", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.ownerId} IS NULL OR ${table.ownerId} = ${authUid}`,
    }),
    pgPolicy("exercises_insert_own", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${table.ownerId} = ${authUid}`,
    }),
    pgPolicy("exercises_update_own", {
      for: "update",
      to: authenticatedRole,
      using: sql`${table.ownerId} = ${authUid}`,
      withCheck: sql`${table.ownerId} = ${authUid}`,
    }),
    pgPolicy("exercises_delete_own", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${table.ownerId} = ${authUid}`,
    }),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// routines
// ---------------------------------------------------------------------------

export const routines = pgTable(
  "routines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    notes: text("notes"),
    position: integer("position").notNull().default(0),
    folder: text("folder"),
    kind: routineKindEnum("kind").notNull().default("strength"),
    // A strength routine's linked warm-up routine, whose exercises are
    // prepended (grouped as the warm-up) when a session starts from it.
    warmupRoutineId: uuid("warmup_routine_id").references((): AnyPgColumn => routines.id, {
      onDelete: "set null",
    }),
    // Target length of the timed warm-up block at the start of a workout.
    warmupMinutes: integer("warmup_minutes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Sync bookkeeping (S3): last-write-wins tie-broken on (updatedAt, deviceId)
    // per ADR-003; deletedAt is a tombstone rather than a real DELETE, so a
    // deletion is itself a row pull picks up instead of silently disappearing.
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Default only exists so ALTER TABLE ADD COLUMN is safe against a
    // non-empty table; every real write always supplies its own device_id.
    deviceId: text("device_id").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(nextSyncSeq),
  },
  (table) => [
    ...ownRowPolicies("routines", table.userId),
    index("routines_server_seq").on(table.serverSeq),
  ],
).enableRLS();

export const routineExercises = pgTable(
  "routine_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    routineId: uuid("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    position: integer("position").notNull().default(0),
    supersetGroup: integer("superset_group"),
    targetSets: integer("target_sets"),
    targetRepsLow: integer("target_reps_low"),
    targetRepsHigh: integer("target_reps_high"),
    targetRestSeconds: integer("target_rest_seconds"),
    // Hold/duration target for time-tracked exercises (e.g. a 30s stretch).
    targetDurationSeconds: integer("target_duration_seconds"),
    // Progressive overload (S9): targetWeight is the baseline working weight;
    // progressionIncrement, when set, is added once per full week elapsed
    // since progressionStartedAt (packages/core's progression module does the
    // math). null/unset increment means no auto-progression — targetWeight is
    // just a static target, same as before this field existed.
    targetWeight: numeric("target_weight", { precision: 7, scale: 2 }),
    progressionIncrement: numeric("progression_increment", { precision: 6, scale: 2 }),
    progressionStartedAt: timestamp("progression_started_at", { withTimezone: true }),
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deviceId: text("device_id").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(nextSyncSeq),
  },
  (table) => [
    ...ownRowPolicies("routine_exercises", table.userId),
    index("routine_exercises_server_seq").on(table.serverSeq),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// programs — an ordered set of routines the app suggests from: either a
// rotating sequence (next = the one after your last completed) or a weekly
// schedule (each entry pinned to a weekday). At most one is active; that's
// enforced client-side, not by a constraint, since LWW sync could otherwise
// reject a legitimate "switch active program" edit made offline.
// ---------------------------------------------------------------------------

export const programs = pgTable(
  "programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mode: programModeEnum("mode").notNull().default("sequence"),
    isActive: boolean("is_active").notNull().default(false),
    notes: text("notes"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deviceId: text("device_id").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(nextSyncSeq),
  },
  (table) => [
    ...ownRowPolicies("programs", table.userId),
    index("programs_server_seq").on(table.serverSeq),
  ],
).enableRLS();

export const programRoutines = pgTable(
  "program_routines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    routineId: uuid("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    // 0 = Sunday .. 6 = Saturday; only meaningful when the program's mode is "weekly".
    weekday: smallint("weekday"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deviceId: text("device_id").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(nextSyncSeq),
  },
  (table) => [
    ...ownRowPolicies("program_routines", table.userId),
    index("program_routines_server_seq").on(table.serverSeq),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    routineId: uuid("routine_id").references(() => routines.id, { onDelete: "set null" }),
    name: text("name"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    notes: text("notes"),
    bodyweight: numeric("bodyweight", { precision: 6, scale: 2 }),
    deviceId: text("device_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(nextSyncSeq),
  },
  (table) => [
    ...ownRowPolicies("sessions", table.userId),
    index("sessions_server_seq").on(table.serverSeq),
  ],
).enableRLS();

export const sessionExercises = pgTable(
  "session_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    position: integer("position").notNull().default(0),
    supersetGroup: integer("superset_group"),
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deviceId: text("device_id").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(nextSyncSeq),
  },
  (table) => [
    ...ownRowPolicies("session_exercises", table.userId),
    index("session_exercises_server_seq").on(table.serverSeq),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// sets — append-only; see ADR-003. UPDATE is additionally rejected by a
// trigger in the 0001 migration, independent of RLS.
// ---------------------------------------------------------------------------

export const sets = pgTable(
  "sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionExerciseId: uuid("session_exercise_id")
      .notNull()
      .references(() => sessionExercises.id, { onDelete: "cascade" }),
    setIndex: integer("set_index").notNull(),
    kind: setKindEnum("kind").notNull().default("working"),
    weight: numeric("weight", { precision: 7, scale: 2 }),
    reps: integer("reps"),
    durationSeconds: integer("duration_seconds"),
    distance: numeric("distance", { precision: 8, scale: 2 }),
    rpe: numeric("rpe", { precision: 3, scale: 1 }),
    rir: integer("rir"),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
    supersedesId: uuid("supersedes_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(nextSyncSeq),
  },
  (table) => [
    foreignKey({
      columns: [table.supersedesId],
      foreignColumns: [table.id],
      name: "sets_supersedes_id_fkey",
    }),
    index("sets_server_seq").on(table.serverSeq),
    pgPolicy("sets_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.userId} = ${authUid}`,
    }),
    pgPolicy("sets_insert_own", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${table.userId} = ${authUid}`,
    }),
    // No update policy: sets are append-only (ADR-003). Deletes go through
    // the tombstone column (deleted_at), written via insert-then-supersede
    // from the client, not a real DELETE.
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// personal_records — derived cache; recomputable from `sets` alone
// ---------------------------------------------------------------------------

export const personalRecords = pgTable(
  "personal_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    kind: prKindEnum("kind").notNull(),
    value: numeric("value", { precision: 10, scale: 2 }).notNull(),
    setId: uuid("set_id").references(() => sets.id, { onDelete: "set null" }),
    achievedAt: timestamp("achieved_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deviceId: text("device_id").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(nextSyncSeq),
  },
  (table) => [
    ...ownRowPolicies("personal_records", table.userId),
    index("personal_records_server_seq").on(table.serverSeq),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// body_measurements — v1: bodyweight only
// ---------------------------------------------------------------------------

export const bodyMeasurements = pgTable(
  "body_measurements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("bodyweight"),
    value: numeric("value", { precision: 7, scale: 2 }).notNull(),
    unit: unitsEnum("unit").notNull(),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deviceId: text("device_id").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(nextSyncSeq),
  },
  (table) => [
    ...ownRowPolicies("body_measurements", table.userId),
    index("body_measurements_server_seq").on(table.serverSeq),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// scheduled_workouts — planned sessions written by the MCP server (S8's
// `schedule_workout`). Deliberately its own table rather than a `sessions`
// row with a future `startedAt`: the phone treats any `sessions` row with
// `endedAt IS NULL` as the in-progress workout to resume (see
// workout-home.tsx), so a "planned" session in that table would surface as
// a phantom active workout. Pull-only from the phone's perspective — it
// never round-trips through push.
// ---------------------------------------------------------------------------

export const scheduledWorkouts = pgTable(
  "scheduled_workouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    routineId: uuid("routine_id").references(() => routines.id, { onDelete: "cascade" }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deviceId: text("device_id").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(nextSyncSeq),
  },
  (table) => [
    ...ownRowPolicies("scheduled_workouts", table.userId),
    index("scheduled_workouts_server_seq").on(table.serverSeq),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// sync_mutations — idempotency ledger for POST /api/sync/push
// ---------------------------------------------------------------------------

export const syncMutations = pgTable(
  "sync_mutations",
  {
    id: uuid("id").primaryKey(), // client-supplied mutation_id
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ownRowPolicies("sync_mutations", table.userId),
).enableRLS();

// ---------------------------------------------------------------------------
// Shared RLS shape: every remaining user-owned table restricts all four
// commands to rows where user_id = auth.uid() (ADR-005).
// ---------------------------------------------------------------------------

function ownRowPolicies(name: string, userId: PgColumn) {
  return [
    pgPolicy(`${name}_select_own`, {
      for: "select",
      to: authenticatedRole,
      using: sql`${userId} = ${authUid}`,
    }),
    pgPolicy(`${name}_insert_own`, {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${userId} = ${authUid}`,
    }),
    pgPolicy(`${name}_update_own`, {
      for: "update",
      to: authenticatedRole,
      using: sql`${userId} = ${authUid}`,
      withCheck: sql`${userId} = ${authUid}`,
    }),
    pgPolicy(`${name}_delete_own`, {
      for: "delete",
      to: authenticatedRole,
      using: sql`${userId} = ${authUid}`,
    }),
  ];
}

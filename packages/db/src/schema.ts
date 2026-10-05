import {
  MUSCLES,
  POST_KINDS,
  type ProgressionRule,
  REACTION_KINDS,
  ROUTINE_ICON_COLORS,
  ROUTINE_ICON_SHAPES,
  SHARE_KINDS,
} from "@jim/core";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  type PgColumn,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
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

// How the routine cards (Up next, the pre-workout sheet) are drawn: "plain" is the
// original flat card, "glass" a frosted card over blurred routine-colored gradients.
export const cardStyleEnum = pgEnum("card_style", ["plain", "glass"]);

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

// Small shape+color icon shown per routine (issue #150), so a list of
// routines doesn't read as identical rows. Kept as two small enums rather
// than one combined one so each axis can grow (a new shape or color)
// without an enum-value migration touching every existing routine's value.
export const routineIconShapeEnum = pgEnum("routine_icon_shape", [...ROUTINE_ICON_SHAPES]);
export const routineIconColorEnum = pgEnum("routine_icon_color", [...ROUTINE_ICON_COLORS]);

// "drop" is kept for sets logged before issue #161 removed it as a UI
// option (Postgres enums can't drop a value without recreating the type) —
// apps/web/lib/sessions/set-kinds.ts's SET_KINDS is the selectable subset.
export const setKindEnum = pgEnum("set_kind", ["warmup", "working", "drop", "failure"]);

export const prKindEnum = pgEnum("pr_kind", ["1rm", "volume", "weight", "reps_at_weight"]);

export const programModeEnum = pgEnum("program_mode", ["sequence", "weekly"]);

// Dynamic Progression (DPR, issue #207). Mirrors @jim/core's DprPresetName,
// ExperienceLevel, and the block lifecycle.
export const dprAggressivenessEnum = pgEnum("dpr_aggressiveness", [
  "conservative",
  "moderate",
  "aggressive",
]);
export const dprExperienceEnum = pgEnum("dpr_experience", ["novice", "intermediate", "advanced"]);
export const dprBlockStatusEnum = pgEnum("dpr_block_status", ["active", "deload", "completed"]);
// A DPR user's "how hard today?" pick for one session (issue #235). Mirrors
// @jim/core's SessionIntensity.
export const sessionIntensityEnum = pgEnum("session_intensity", ["light", "maintain", "push"]);
// A friend request (issue #35) is "pending" until the addressee accepts it;
// declining or unfriending deletes the row rather than keeping a status.
export const friendshipStatusEnum = pgEnum("friendship_status", ["pending", "accepted"]);

// What a friend can react to a finished workout with (issue #303); the UI
// shows each as an emoji (@jim/core's REACTION_EMOJI).
export const reactionKindEnum = pgEnum("reaction_kind", [...REACTION_KINDS]);

// What a post shares with friends (issue #316): a finished workout, a
// personal record or an earned achievement. Mirrors @jim/core's POST_KINDS.
export const postKindEnum = pgEnum("post_kind", [...POST_KINDS]);

// What a share link freezes (issue #254). Mirrors @jim/core's SHARE_KINDS.
export const shareKindEnum = pgEnum("share_kind", [...SHARE_KINDS]);

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
    // How friends find each other (issue #35): lowercase, unique, matched
    // exactly. Filled from the email's local part by the users_default_username
    // trigger (migration 0023) when a row is created without one.
    username: text("username"),
    // The profile picture friends see (issue #316): a small square JPEG data
    // URL the phone crops and shrinks before upload (@jim/core's
    // AVATAR_MAX_LENGTH caps it). Null shows the username's initial.
    avatar: text("avatar"),
    // Sharing settings (issue #316). Whether friends see this user's finished
    // workouts in their feed at all, and if so whether they see the exercises
    // and weights or just the name and duration. Posts are shared explicitly,
    // so they show either way. Read by friend_workouts() (migration 0031).
    shareWorkouts: boolean("share_workouts").notNull().default(true),
    shareWorkoutDetails: boolean("share_workout_details").notNull().default(true),
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
    // The routine cards' look (issue #374). "plain" keeps the original flat cards.
    cardStyle: cardStyleEnum("card_style").notNull().default("plain"),
    // Whether the live pace tracker card shows during a workout.
    showPaceTracker: boolean("show_pace_tracker").notNull().default(true),

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

    // Dynamic Progression (issue #207) — off by default. `dprExperience` is
    // the user-confirmed level (null until the setup wizard runs);
    // `dprEquipmentIncrements` holds per-bucket overrides of @jim/core's
    // DEFAULT_INCREMENTS, e.g. { "barbell": { "lb": 5 } }.
    dprEnabled: boolean("dpr_enabled").notNull().default(false),
    dprAggressiveness: dprAggressivenessEnum("dpr_aggressiveness").notNull().default("moderate"),
    dprExperience: dprExperienceEnum("dpr_experience"),
    dprEquipmentIncrements: jsonb("dpr_equipment_increments")
      .$type<Record<string, Record<string, number>>>()
      .notNull()
      .default({}),
    dprDefaultRepLow: integer("dpr_default_rep_low").notNull().default(6),
    dprDefaultRepHigh: integer("dpr_default_rep_high").notNull().default(10),
    dprPromptDismissedAt: timestamp("dpr_prompt_dismissed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("users_username").on(table.username),
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
    // A demo video link the user set (issue #252). The catalog doesn't ship
    // any; exercises without one fall back to a YouTube search (core's
    // exerciseDemo).
    videoUrl: text("video_url"),
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
    // Defaults only exist so ALTER TABLE ADD COLUMN is safe against a
    // non-empty table; every real write picks the next unused combo via
    // packages/core's pickDefaultRoutineIcon instead of taking this default.
    iconShape: routineIconShapeEnum("icon_shape").notNull().default("square"),
    iconColor: routineIconColorEnum("icon_color").notNull().default("red"),
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
    // Starting weight for an exercise with no history yet. The weekly
    // auto-increment that once built on it was replaced by DPR (issue #217,
    // docs/DECISIONS.md ADR-016).
    targetWeight: numeric("target_weight", { precision: 7, scale: 2 }),
    // A custom progression rule (issue #255), @jim/core's ProgressionRule;
    // null = DPR or plain "last time" prefill. Parse with
    // `parseProgressionRule` — rows from older clients may lack it.
    progressionRule: jsonb("progression_rule").$type<ProgressionRule>(),
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
    // Planned length (issue #216); null = open-ended. `activatedAt` is when
    // it last became the active program, for "Week N of M".
    durationWeeks: integer("duration_weeks"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
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
    // Null marks a rest day (issue #366): a step in a sequence, or a pinned
    // weekday in a weekly schedule, with no routine to run.
    routineId: uuid("routine_id").references(() => routines.id, { onDelete: "cascade" }),
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
// dpr_blocks / dpr_block_lifts — Dynamic Progression training blocks (issue
// #207). Only config is stored: DPR's calls are pure @jim/core functions of
// set history, so the decision log is derived, never persisted. At most 5
// lifts per block, enforced in the app.
// ---------------------------------------------------------------------------

export const dprBlocks = pgTable(
  "dpr_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    // 6, 8 or 12
    weeks: integer("weeks").notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: dprBlockStatusEnum("status").notNull().default("active"),
    // Snapshots from when the block started, so changing settings mid-block
    // doesn't move its goals.
    aggressiveness: dprAggressivenessEnum("aggressiveness").notNull(),
    experience: dprExperienceEnum("experience").notNull(),
    // Mesocycle mode (issue #250): DPR also grows each muscle's weekly sets
    // through the block. The plan itself is derived, never stored.
    volumeMode: boolean("volume_mode").notNull().default(false),
    programId: uuid("program_id").references(() => programs.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deviceId: text("device_id").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(nextSyncSeq),
  },
  (table) => [
    ...ownRowPolicies("dpr_blocks", table.userId),
    index("dpr_blocks_server_seq").on(table.serverSeq),
  ],
).enableRLS();

export const dprBlockLifts = pgTable(
  "dpr_block_lifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockId: uuid("block_id")
      .notNull()
      .references(() => dprBlocks.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    baselineE1rm: numeric("baseline_e1rm", { precision: 7, scale: 2 }),
    goalE1rm: numeric("goal_e1rm", { precision: 7, scale: 2 }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deviceId: text("device_id").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(nextSyncSeq),
  },
  (table) => [
    ...ownRowPolicies("dpr_block_lifts", table.userId),
    index("dpr_block_lifts_server_seq").on(table.serverSeq),
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
    // Chosen on the pre-workout sheet (issue #235); null when none was asked
    // (DPR off, or an empty workout). Adjusts this session's DPR calls only.
    intensity: sessionIntensityEnum("intensity"),
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
    // The exercise's sticky note (issue #271), shown in every later workout
    // with this exercise. Null means "inherit the latest earlier one"; an
    // empty string means it was cleared here.
    stickyNote: text("sticky_note"),
    // This workout's rest override from the ⋯ menu; null falls back to the
    // routine's target rest, then the user's default. 0 turns the timer off.
    restSeconds: integer("rest_seconds"),
    // Warm-up sets added from the ⋯ menu, planned ahead of the working sets.
    warmupSets: integer("warmup_sets"),
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
    // Rest taken before this set (issue #233): seconds since the session's
    // previous set, and the rest the timer was counting down then. Null for
    // a session's first set and for warm-up exercises, which have no rest.
    restSeconds: integer("rest_seconds"),
    restTargetSeconds: integer("rest_target_seconds"),
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

// ---------------------------------------------------------------------------
// push_subscriptions — Web Push endpoints, one per (user, browser install).
// The browser's push service wakes the service worker with these even while
// Jim is fully closed (see docs/DECISIONS.md ADR on Web Push). Written by
// POST/DELETE /api/push/subscription under RLS; read across all users only
// by the production build's release-push step, which connects as the
// migration role (scripts/send-release-push.ts).
// ---------------------------------------------------------------------------

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Per-user rather than global: an upsert across users would need to
    // update another user's row, which RLS (rightly) refuses.
    uniqueIndex("push_subscriptions_user_endpoint").on(table.userId, table.endpoint),
    ...ownRowPolicies("push_subscriptions", table.userId),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// rest_timer_pushes — at most one pending "Rest complete" push per user: the
// rest period currently counting down, and which of the user's devices
// started it. POST /api/push/rest-timer upserts it and schedules a delayed
// QStash callback for `ends_at`; that callback (/api/push/rest-timer/fire)
// only sends if the row still matches, so skipping (DELETE) or restarting
// (a new upsert) a rest silently invalidates the earlier callback instead of
// needing to cancel it. See docs/DECISIONS.md ADR-014.
// ---------------------------------------------------------------------------

export const restTimerPushes = pgTable(
  "rest_timer_pushes",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [...ownRowPolicies("rest_timer_pushes", table.userId)],
).enableRLS();

// ---------------------------------------------------------------------------
// friendships — one row per pair of users (issue #35), in either direction:
// the requester asked, the addressee accepts. Readable by both people in it;
// never written directly. Every write, and every read of a friend's data, goes
// through the SECURITY DEFINER functions in migration 0023, so the tables that
// sync pulls keep their own-rows-only RLS and never start returning a friend's
// rows into this user's IndexedDB.
// ---------------------------------------------------------------------------

export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addresseeId: uuid("addressee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: friendshipStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (table) => [
    // One row per pair, whichever of the two asked first.
    uniqueIndex("friendships_pair").on(
      sql`least(${table.requesterId}, ${table.addresseeId})`,
      sql`greatest(${table.requesterId}, ${table.addresseeId})`,
    ),
    index("friendships_addressee").on(table.addresseeId),
    check("friendships_not_self", sql`${table.requesterId} <> ${table.addresseeId}`),
    pgPolicy("friendships_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${authUid} IN (${table.requesterId}, ${table.addresseeId})`,
    }),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// workout_reactions — a friend's reaction to someone's finished session
// (issue #303). One row per (session, reactor, kind), so each kind toggles.
// Like friendships, readable only by the reactor and never written directly:
// migration 0025's SECURITY DEFINER functions check the friendship on write
// and hand the session's owner counts and names rather than rows (ADR-017).
// ---------------------------------------------------------------------------

export const workoutReactions = pgTable(
  "workout_reactions",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: reactionKindEnum("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("workout_reactions_unique").on(table.sessionId, table.userId, table.kind),
    index("workout_reactions_user").on(table.userId),
    pgPolicy("workout_reactions_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.userId} = ${authUid}`,
    }),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// posts — something a user chose to share with their friends (issue #316): a
// finished workout (`session_id` set), a personal record or an achievement,
// with an optional caption. `title` and `detail` are written by the phone,
// which has the history that describes it, and shown as is. Like friendships,
// readable only by the author and never written directly: migration 0031's
// SECURITY DEFINER functions create and delete posts, and hand friends their
// posts (ADR-017). Not synced to the phone.
// ---------------------------------------------------------------------------

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: postKindEnum("kind").notNull(),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    detail: text("detail"),
    caption: text("caption"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("posts_user_created").on(table.userId, table.createdAt),
    pgPolicy("posts_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.userId} = ${authUid}`,
    }),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// share_links — a routine or program frozen into a read-only snapshot that
// anyone signed in can open by its link (issue #254). The id is the link: a
// random v4 uuid, so links can't be guessed or listed. The sharer reads and
// deletes (revokes) their own links under RLS; there's no update policy, so
// a snapshot never changes once written. Anyone else reads one only through
// migration 0036's SECURITY DEFINER function, by its id, and gets the
// snapshot and the sharer's username, nothing more. Not synced to the phone.
// ---------------------------------------------------------------------------

export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: shareKindEnum("kind").notNull(),
    name: text("name").notNull(),
    // @jim/core's ShareSnapshot, checked with parseShareSnapshot on the way in.
    snapshot: jsonb("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("share_links_user_created").on(table.userId, table.createdAt),
    pgPolicy("share_links_select_own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.userId} = ${authUid}`,
    }),
    pgPolicy("share_links_insert_own", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${table.userId} = ${authUid}`,
    }),
    pgPolicy("share_links_delete_own", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${table.userId} = ${authUid}`,
    }),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// personal_access_tokens — long-lived bearer tokens for MCP clients that
// can't do OAuth (issue #246). Only a SHA-256 hash of each token is stored;
// the plaintext is shown once, when it's created. Managed from Settings via
// /api/access-tokens under RLS, and never synced to the phone. The MCP server
// resolves a presented token to its owner through migration 0027's SECURITY
// DEFINER function, then runs every tool as that user under RLS, the same
// as an OAuth session (ADR-006).
// ---------------------------------------------------------------------------

export const personalAccessTokens = pgTable(
  "personal_access_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    // The token's first few characters, to tell tokens apart in the list.
    tokenPrefix: text("token_prefix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Null never expires.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("personal_access_tokens_hash").on(table.tokenHash),
    index("personal_access_tokens_user").on(table.userId),
    ...ownRowPolicies("personal_access_tokens", table.userId),
  ],
).enableRLS();

CREATE TYPE "public"."force" AS ENUM('push', 'pull', 'static');--> statement-breakpoint
CREATE TYPE "public"."level" AS ENUM('beginner', 'intermediate', 'expert');--> statement-breakpoint
CREATE TYPE "public"."mechanic" AS ENUM('compound', 'isolation');--> statement-breakpoint
CREATE TYPE "public"."muscle" AS ENUM('abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms', 'glutes', 'hamstrings', 'lats', 'lower back', 'middle back', 'neck', 'quadriceps', 'shoulders', 'traps', 'triceps');--> statement-breakpoint
CREATE TYPE "public"."pr_kind" AS ENUM('1rm', 'volume', 'weight', 'reps_at_weight');--> statement-breakpoint
CREATE TYPE "public"."set_kind" AS ENUM('warmup', 'working', 'drop', 'failure');--> statement-breakpoint
CREATE TYPE "public"."tracking_type" AS ENUM('weight_reps', 'time', 'distance', 'bodyweight', 'weighted_bodyweight');--> statement-breakpoint
CREATE TYPE "public"."units" AS ENUM('lb', 'kg');--> statement-breakpoint
CREATE TABLE "body_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'bodyweight' NOT NULL,
	"value" numeric(7, 2) NOT NULL,
	"unit" "units" NOT NULL,
	"measured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "body_measurements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"primary_muscles" "muscle"[] DEFAULT ARRAY[]::muscle[] NOT NULL,
	"secondary_muscles" "muscle"[] DEFAULT ARRAY[]::muscle[] NOT NULL,
	"equipment" text,
	"mechanic" "mechanic",
	"force" "force",
	"level" "level",
	"tracking_type" "tracking_type" NOT NULL,
	"instructions" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"image_urls" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "personal_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"kind" "pr_kind" NOT NULL,
	"value" numeric(10, 2) NOT NULL,
	"set_id" uuid,
	"achieved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "routine_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"routine_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"superset_group" integer,
	"target_sets" integer,
	"target_reps_low" integer,
	"target_reps_high" integer,
	"target_rest_seconds" integer,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "routine_exercises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"position" integer DEFAULT 0 NOT NULL,
	"folder" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "session_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"superset_group" integer,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "session_exercises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"routine_id" uuid,
	"name" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"notes" text,
	"bodyweight" numeric(6, 2),
	"device_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_exercise_id" uuid NOT NULL,
	"set_index" integer NOT NULL,
	"kind" "set_kind" DEFAULT 'working' NOT NULL,
	"weight" numeric(7, 2),
	"reps" integer,
	"duration_seconds" integer,
	"distance" numeric(8, 2),
	"rpe" numeric(3, 1),
	"rir" integer,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"supersedes_id" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sync_mutations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_mutations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"units" "units" DEFAULT 'lb' NOT NULL,
	"default_bar_weight" numeric(6, 2) DEFAULT '45' NOT NULL,
	"available_plates" numeric(6, 2)[] DEFAULT ARRAY[45, 35, 25, 10, 5, 2.5]::numeric[] NOT NULL,
	"default_rest_seconds" integer DEFAULT 90 NOT NULL,
	"week_start" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_session_exercise_id_session_exercises_id_fk" FOREIGN KEY ("session_exercise_id") REFERENCES "public"."session_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "public"."sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_global_slug" ON "exercises" USING btree ("slug") WHERE "exercises"."owner_id" IS NULL;--> statement-breakpoint
CREATE POLICY "body_measurements_select_own" ON "body_measurements" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("body_measurements"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "body_measurements_insert_own" ON "body_measurements" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("body_measurements"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "body_measurements_update_own" ON "body_measurements" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("body_measurements"."user_id" = (select auth.uid())) WITH CHECK ("body_measurements"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "body_measurements_delete_own" ON "body_measurements" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("body_measurements"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercises_select_own_or_global" ON "exercises" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("exercises"."owner_id" IS NULL OR "exercises"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercises_insert_own" ON "exercises" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("exercises"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercises_update_own" ON "exercises" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("exercises"."owner_id" = (select auth.uid())) WITH CHECK ("exercises"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercises_delete_own" ON "exercises" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("exercises"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "personal_records_select_own" ON "personal_records" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("personal_records"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "personal_records_insert_own" ON "personal_records" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("personal_records"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "personal_records_update_own" ON "personal_records" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("personal_records"."user_id" = (select auth.uid())) WITH CHECK ("personal_records"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "personal_records_delete_own" ON "personal_records" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("personal_records"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "routine_exercises_select_own" ON "routine_exercises" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("routine_exercises"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "routine_exercises_insert_own" ON "routine_exercises" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("routine_exercises"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "routine_exercises_update_own" ON "routine_exercises" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("routine_exercises"."user_id" = (select auth.uid())) WITH CHECK ("routine_exercises"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "routine_exercises_delete_own" ON "routine_exercises" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("routine_exercises"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "routines_select_own" ON "routines" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("routines"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "routines_insert_own" ON "routines" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("routines"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "routines_update_own" ON "routines" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("routines"."user_id" = (select auth.uid())) WITH CHECK ("routines"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "routines_delete_own" ON "routines" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("routines"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "session_exercises_select_own" ON "session_exercises" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("session_exercises"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "session_exercises_insert_own" ON "session_exercises" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("session_exercises"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "session_exercises_update_own" ON "session_exercises" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("session_exercises"."user_id" = (select auth.uid())) WITH CHECK ("session_exercises"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "session_exercises_delete_own" ON "session_exercises" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("session_exercises"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "sessions_select_own" ON "sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("sessions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "sessions_insert_own" ON "sessions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("sessions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "sessions_update_own" ON "sessions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("sessions"."user_id" = (select auth.uid())) WITH CHECK ("sessions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "sessions_delete_own" ON "sessions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("sessions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "sets_select_own" ON "sets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("sets"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "sets_insert_own" ON "sets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("sets"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "sync_mutations_select_own" ON "sync_mutations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("sync_mutations"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "sync_mutations_insert_own" ON "sync_mutations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("sync_mutations"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "sync_mutations_update_own" ON "sync_mutations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("sync_mutations"."user_id" = (select auth.uid())) WITH CHECK ("sync_mutations"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "sync_mutations_delete_own" ON "sync_mutations" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("sync_mutations"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "users_select_own" ON "users" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("users"."id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "users_update_own" ON "users" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("users"."id" = (select auth.uid())) WITH CHECK ("users"."id" = (select auth.uid()));
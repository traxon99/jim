CREATE TYPE "public"."dpr_aggressiveness" AS ENUM('conservative', 'moderate', 'aggressive');--> statement-breakpoint
CREATE TYPE "public"."dpr_block_status" AS ENUM('active', 'deload', 'completed');--> statement-breakpoint
CREATE TYPE "public"."dpr_experience" AS ENUM('novice', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TABLE "dpr_block_lifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"baseline_e1rm" numeric(7, 2),
	"goal_e1rm" numeric(7, 2),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dpr_block_lifts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dpr_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"weeks" integer NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "dpr_block_status" DEFAULT 'active' NOT NULL,
	"aggressiveness" "dpr_aggressiveness" NOT NULL,
	"experience" "dpr_experience" NOT NULL,
	"program_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dpr_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "duration_weeks" integer;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dpr_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dpr_aggressiveness" "dpr_aggressiveness" DEFAULT 'moderate' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dpr_experience" "dpr_experience";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dpr_equipment_increments" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dpr_default_rep_low" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dpr_default_rep_high" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dpr_prompt_dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dpr_block_lifts" ADD CONSTRAINT "dpr_block_lifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpr_block_lifts" ADD CONSTRAINT "dpr_block_lifts_block_id_dpr_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."dpr_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpr_block_lifts" ADD CONSTRAINT "dpr_block_lifts_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpr_blocks" ADD CONSTRAINT "dpr_blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpr_blocks" ADD CONSTRAINT "dpr_blocks_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dpr_block_lifts_server_seq" ON "dpr_block_lifts" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX "dpr_blocks_server_seq" ON "dpr_blocks" USING btree ("server_seq");--> statement-breakpoint
CREATE POLICY "dpr_block_lifts_select_own" ON "dpr_block_lifts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("dpr_block_lifts"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "dpr_block_lifts_insert_own" ON "dpr_block_lifts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("dpr_block_lifts"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "dpr_block_lifts_update_own" ON "dpr_block_lifts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("dpr_block_lifts"."user_id" = (select auth.uid())) WITH CHECK ("dpr_block_lifts"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "dpr_block_lifts_delete_own" ON "dpr_block_lifts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("dpr_block_lifts"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "dpr_blocks_select_own" ON "dpr_blocks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("dpr_blocks"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "dpr_blocks_insert_own" ON "dpr_blocks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("dpr_blocks"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "dpr_blocks_update_own" ON "dpr_blocks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("dpr_blocks"."user_id" = (select auth.uid())) WITH CHECK ("dpr_blocks"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "dpr_blocks_delete_own" ON "dpr_blocks" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("dpr_blocks"."user_id" = (select auth.uid()));
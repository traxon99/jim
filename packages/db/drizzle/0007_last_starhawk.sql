CREATE TYPE "public"."program_mode" AS ENUM('sequence', 'weekly');--> statement-breakpoint
CREATE TABLE "program_routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"routine_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"weekday" smallint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "program_routines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mode" "program_mode" DEFAULT 'sequence' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"notes" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "programs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "program_routines" ADD CONSTRAINT "program_routines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_routines" ADD CONSTRAINT "program_routines_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_routines" ADD CONSTRAINT "program_routines_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "program_routines_server_seq" ON "program_routines" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX "programs_server_seq" ON "programs" USING btree ("server_seq");--> statement-breakpoint
CREATE POLICY "program_routines_select_own" ON "program_routines" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("program_routines"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "program_routines_insert_own" ON "program_routines" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("program_routines"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "program_routines_update_own" ON "program_routines" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("program_routines"."user_id" = (select auth.uid())) WITH CHECK ("program_routines"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "program_routines_delete_own" ON "program_routines" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("program_routines"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "programs_select_own" ON "programs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("programs"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "programs_insert_own" ON "programs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("programs"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "programs_update_own" ON "programs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("programs"."user_id" = (select auth.uid())) WITH CHECK ("programs"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "programs_delete_own" ON "programs" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("programs"."user_id" = (select auth.uid()));
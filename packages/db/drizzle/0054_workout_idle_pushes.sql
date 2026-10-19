CREATE TABLE "workout_idle_pushes" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL,
	"auto_end_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workout_idle_pushes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auto_end_workout_minutes" integer DEFAULT 60;--> statement-breakpoint
ALTER TABLE "workout_idle_pushes" ADD CONSTRAINT "workout_idle_pushes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "workout_idle_pushes_select_own" ON "workout_idle_pushes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("workout_idle_pushes"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "workout_idle_pushes_insert_own" ON "workout_idle_pushes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("workout_idle_pushes"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "workout_idle_pushes_update_own" ON "workout_idle_pushes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("workout_idle_pushes"."user_id" = (select auth.uid())) WITH CHECK ("workout_idle_pushes"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "workout_idle_pushes_delete_own" ON "workout_idle_pushes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("workout_idle_pushes"."user_id" = (select auth.uid()));
CREATE TABLE "scheduled_workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"routine_id" uuid,
	"scheduled_for" timestamp with time zone NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_workouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scheduled_workouts" ADD CONSTRAINT "scheduled_workouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_workouts" ADD CONSTRAINT "scheduled_workouts_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_workouts_server_seq" ON "scheduled_workouts" USING btree ("server_seq");--> statement-breakpoint
CREATE POLICY "scheduled_workouts_select_own" ON "scheduled_workouts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("scheduled_workouts"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "scheduled_workouts_insert_own" ON "scheduled_workouts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("scheduled_workouts"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "scheduled_workouts_update_own" ON "scheduled_workouts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("scheduled_workouts"."user_id" = (select auth.uid())) WITH CHECK ("scheduled_workouts"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "scheduled_workouts_delete_own" ON "scheduled_workouts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("scheduled_workouts"."user_id" = (select auth.uid()));
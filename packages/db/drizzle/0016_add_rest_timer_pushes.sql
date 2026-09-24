CREATE TABLE "rest_timer_pushes" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rest_timer_pushes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rest_timer_pushes" ADD CONSTRAINT "rest_timer_pushes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "rest_timer_pushes_select_own" ON "rest_timer_pushes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("rest_timer_pushes"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "rest_timer_pushes_insert_own" ON "rest_timer_pushes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("rest_timer_pushes"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "rest_timer_pushes_update_own" ON "rest_timer_pushes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("rest_timer_pushes"."user_id" = (select auth.uid())) WITH CHECK ("rest_timer_pushes"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "rest_timer_pushes_delete_own" ON "rest_timer_pushes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("rest_timer_pushes"."user_id" = (select auth.uid()));
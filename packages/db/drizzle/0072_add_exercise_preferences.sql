CREATE TYPE "public"."exercise_preference" AS ENUM('like', 'dislike');--> statement-breakpoint
CREATE TABLE "exercise_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exercise_slug" text NOT NULL,
	"preference" "exercise_preference" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercise_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "exercise_preferences" ADD CONSTRAINT "exercise_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_preferences_server_seq" ON "exercise_preferences" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX "exercise_preferences_user_seq" ON "exercise_preferences" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE INDEX "exercise_preferences_user_slug" ON "exercise_preferences" USING btree ("user_id","exercise_slug");--> statement-breakpoint
CREATE POLICY "exercise_preferences_select_own" ON "exercise_preferences" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("exercise_preferences"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercise_preferences_insert_own" ON "exercise_preferences" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("exercise_preferences"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercise_preferences_update_own" ON "exercise_preferences" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("exercise_preferences"."user_id" = (select auth.uid())) WITH CHECK ("exercise_preferences"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercise_preferences_delete_own" ON "exercise_preferences" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("exercise_preferences"."user_id" = (select auth.uid()));
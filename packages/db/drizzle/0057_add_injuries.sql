CREATE TABLE "injuries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"area" text NOT NULL,
	"side" text,
	"started_on" date NOT NULL,
	"healed_on" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "injuries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pain_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"injury_id" uuid NOT NULL,
	"day" date NOT NULL,
	"pain_level" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	CONSTRAINT "pain_checkins_pain_level_range" CHECK ("pain_checkins"."pain_level" BETWEEN 0 AND 10)
);
--> statement-breakpoint
ALTER TABLE "pain_checkins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pain_checkins" ADD CONSTRAINT "pain_checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pain_checkins" ADD CONSTRAINT "pain_checkins_injury_id_injuries_id_fk" FOREIGN KEY ("injury_id") REFERENCES "public"."injuries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "injuries_server_seq" ON "injuries" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX "injuries_user_seq" ON "injuries" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE INDEX "pain_checkins_server_seq" ON "pain_checkins" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX "pain_checkins_user_seq" ON "pain_checkins" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE INDEX "pain_checkins_injury_id" ON "pain_checkins" USING btree ("injury_id");--> statement-breakpoint
CREATE POLICY "injuries_select_own" ON "injuries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("injuries"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "injuries_insert_own" ON "injuries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("injuries"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "injuries_update_own" ON "injuries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("injuries"."user_id" = (select auth.uid())) WITH CHECK ("injuries"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "injuries_delete_own" ON "injuries" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("injuries"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "pain_checkins_select_own" ON "pain_checkins" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("pain_checkins"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "pain_checkins_insert_own" ON "pain_checkins" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("pain_checkins"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "pain_checkins_update_own" ON "pain_checkins" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("pain_checkins"."user_id" = (select auth.uid())) WITH CHECK ("pain_checkins"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "pain_checkins_delete_own" ON "pain_checkins" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("pain_checkins"."user_id" = (select auth.uid()));
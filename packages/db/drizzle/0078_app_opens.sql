CREATE TABLE "app_opens" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"app_version" text,
	"last_opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_opens_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "app_opens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_opens" ADD CONSTRAINT "app_opens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_opens_day" ON "app_opens" USING btree ("day");--> statement-breakpoint
CREATE POLICY "app_opens_select_own" ON "app_opens" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("app_opens"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "app_opens_insert_own" ON "app_opens" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("app_opens"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "app_opens_update_own" ON "app_opens" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("app_opens"."user_id" = (select auth.uid())) WITH CHECK ("app_opens"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "app_opens_delete_own" ON "app_opens" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("app_opens"."user_id" = (select auth.uid()));
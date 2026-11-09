CREATE TABLE "sick_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL
);--> statement-breakpoint
ALTER TABLE "sick_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sick_days" ADD CONSTRAINT "sick_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sick_days_server_seq" ON "sick_days" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX "sick_days_user_seq" ON "sick_days" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE INDEX "sick_days_user_day" ON "sick_days" USING btree ("user_id","day");--> statement-breakpoint
CREATE POLICY "sick_days_select_own" ON "sick_days" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("sick_days"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "sick_days_insert_own" ON "sick_days" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("sick_days"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "sick_days_update_own" ON "sick_days" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("sick_days"."user_id" = (select auth.uid())) WITH CHECK ("sick_days"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "sick_days_delete_own" ON "sick_days" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("sick_days"."user_id" = (select auth.uid()));

CREATE TABLE "gyms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"notes" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gyms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gyms_server_seq" ON "gyms" USING btree ("server_seq");--> statement-breakpoint
CREATE POLICY "gyms_select_own" ON "gyms" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("gyms"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "gyms_insert_own" ON "gyms" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("gyms"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "gyms_update_own" ON "gyms" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("gyms"."user_id" = (select auth.uid())) WITH CHECK ("gyms"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "gyms_delete_own" ON "gyms" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("gyms"."user_id" = (select auth.uid()));
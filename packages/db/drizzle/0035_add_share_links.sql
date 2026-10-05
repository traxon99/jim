CREATE TYPE "public"."share_kind" AS ENUM('routine', 'program');--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "share_kind" NOT NULL,
	"name" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "share_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_links_user_created" ON "share_links" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE POLICY "share_links_select_own" ON "share_links" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("share_links"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "share_links_insert_own" ON "share_links" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("share_links"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "share_links_delete_own" ON "share_links" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("share_links"."user_id" = (select auth.uid()));
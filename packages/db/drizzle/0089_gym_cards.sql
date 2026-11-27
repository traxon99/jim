CREATE TABLE "gym_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"gym_id" uuid,
	"name" text NOT NULL,
	"format" text NOT NULL,
	"code" text NOT NULL,
	"color" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gym_cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gym_cards" ADD CONSTRAINT "gym_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_cards" ADD CONSTRAINT "gym_cards_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gym_cards_server_seq" ON "gym_cards" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX "gym_cards_user_seq" ON "gym_cards" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE POLICY "gym_cards_select_own" ON "gym_cards" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("gym_cards"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "gym_cards_insert_own" ON "gym_cards" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("gym_cards"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "gym_cards_update_own" ON "gym_cards" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("gym_cards"."user_id" = (select auth.uid())) WITH CHECK ("gym_cards"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "gym_cards_delete_own" ON "gym_cards" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("gym_cards"."user_id" = (select auth.uid()));
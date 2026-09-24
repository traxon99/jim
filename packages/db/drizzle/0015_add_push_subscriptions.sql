CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_user_endpoint" ON "push_subscriptions" USING btree ("user_id","endpoint");--> statement-breakpoint
CREATE POLICY "push_subscriptions_select_own" ON "push_subscriptions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("push_subscriptions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "push_subscriptions_insert_own" ON "push_subscriptions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("push_subscriptions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "push_subscriptions_update_own" ON "push_subscriptions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("push_subscriptions"."user_id" = (select auth.uid())) WITH CHECK ("push_subscriptions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "push_subscriptions_delete_own" ON "push_subscriptions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("push_subscriptions"."user_id" = (select auth.uid()));
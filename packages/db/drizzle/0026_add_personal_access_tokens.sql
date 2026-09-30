CREATE TABLE "personal_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "personal_access_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "personal_access_tokens" ADD CONSTRAINT "personal_access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "personal_access_tokens_hash" ON "personal_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "personal_access_tokens_user" ON "personal_access_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "personal_access_tokens_select_own" ON "personal_access_tokens" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("personal_access_tokens"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "personal_access_tokens_insert_own" ON "personal_access_tokens" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("personal_access_tokens"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "personal_access_tokens_update_own" ON "personal_access_tokens" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("personal_access_tokens"."user_id" = (select auth.uid())) WITH CHECK ("personal_access_tokens"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "personal_access_tokens_delete_own" ON "personal_access_tokens" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("personal_access_tokens"."user_id" = (select auth.uid()));
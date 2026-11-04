ALTER TYPE "public"."reaction_kind" ADD VALUE 'grind';--> statement-breakpoint
CREATE TABLE "post_reactions" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "reaction_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_reactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- One reaction per person: keep each reactor's newest row before the unique index changes.
DELETE FROM workout_reactions a
USING workout_reactions b
WHERE a.session_id = b.session_id
  AND a.user_id = b.user_id
  AND (
    a.created_at < b.created_at
    OR (a.created_at = b.created_at AND a.kind::text < b.kind::text)
  );--> statement-breakpoint
DROP INDEX "workout_reactions_unique";--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "post_reactions_unique" ON "post_reactions" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "post_reactions_user" ON "post_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_reactions_unique" ON "workout_reactions" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE POLICY "post_reactions_select_own" ON "post_reactions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("post_reactions"."user_id" = (select auth.uid()));
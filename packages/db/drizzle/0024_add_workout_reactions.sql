CREATE TYPE "public"."reaction_kind" AS ENUM('strong', 'fire', 'clap', 'party');--> statement-breakpoint
CREATE TABLE "workout_reactions" (
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "reaction_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workout_reactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workout_reactions" ADD CONSTRAINT "workout_reactions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_reactions" ADD CONSTRAINT "workout_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workout_reactions_unique" ON "workout_reactions" USING btree ("session_id","user_id","kind");--> statement-breakpoint
CREATE INDEX "workout_reactions_user" ON "workout_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "workout_reactions_select_own" ON "workout_reactions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("workout_reactions"."user_id" = (select auth.uid()));
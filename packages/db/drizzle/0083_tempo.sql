ALTER TABLE "routine_exercises" ADD COLUMN "tempo" text;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN "tempo" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_tempo" boolean DEFAULT false NOT NULL;
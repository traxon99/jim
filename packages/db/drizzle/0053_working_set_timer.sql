ALTER TABLE "sets" ADD COLUMN "work_seconds" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_set_timer" boolean DEFAULT false NOT NULL;
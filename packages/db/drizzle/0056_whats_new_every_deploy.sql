ALTER TABLE "release_pushes" ADD COLUMN "audience" text DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "push_whats_new_every_deploy" boolean DEFAULT false NOT NULL;
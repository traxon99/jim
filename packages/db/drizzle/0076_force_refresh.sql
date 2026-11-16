ALTER TABLE "users" ADD COLUMN "update_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reset_requested_at" timestamp with time zone;
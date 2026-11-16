ALTER TABLE "routines" ADD COLUMN "one_off" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "one_off_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "one_off_day" date;
ALTER TABLE "routine_exercises" ADD COLUMN "target_weight" numeric(7, 2);--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD COLUMN "progression_increment" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD COLUMN "progression_started_at" timestamp with time zone;
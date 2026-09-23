CREATE TYPE "public"."exercise_category" AS ENUM('strength', 'warmup');--> statement-breakpoint
CREATE TYPE "public"."routine_kind" AS ENUM('strength', 'warmup');--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "category" "exercise_category" DEFAULT 'strength' NOT NULL;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD COLUMN "target_duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "kind" "routine_kind" DEFAULT 'strength' NOT NULL;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "warmup_routine_id" uuid;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "warmup_minutes" integer;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_warmup_routine_id_routines_id_fk" FOREIGN KEY ("warmup_routine_id") REFERENCES "public"."routines"("id") ON DELETE set null ON UPDATE no action;
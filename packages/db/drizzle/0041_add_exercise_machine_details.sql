CREATE TYPE "public"."pulley_type" AS ENUM('single', 'double');--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "machine_brand" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "machine_model" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "pulley_type" "pulley_type";--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "gym_id" uuid;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE set null ON UPDATE no action;
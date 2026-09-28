CREATE TYPE "public"."session_intensity" AS ENUM('light', 'maintain', 'push');--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "intensity" "session_intensity";--> statement-breakpoint
ALTER TABLE "sets" ADD COLUMN "rest_seconds" integer;--> statement-breakpoint
ALTER TABLE "sets" ADD COLUMN "rest_target_seconds" integer;
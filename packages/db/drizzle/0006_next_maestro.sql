CREATE TYPE "public"."color_scheme" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "color_scheme" "color_scheme" DEFAULT 'system' NOT NULL;
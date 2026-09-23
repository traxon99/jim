CREATE TYPE "public"."font_family" AS ENUM('sans', 'serif', 'mono');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "font_family" "font_family" DEFAULT 'sans' NOT NULL;
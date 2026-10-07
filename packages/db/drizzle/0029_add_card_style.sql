CREATE TYPE "public"."card_style" AS ENUM('plain', 'glass');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "card_style" "card_style" DEFAULT 'plain' NOT NULL;
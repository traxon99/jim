CREATE TYPE "public"."tempo_cue_style" AS ENUM('voice', 'sounds');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tempo_cues" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tempo_cue_style" "tempo_cue_style" DEFAULT 'voice' NOT NULL;
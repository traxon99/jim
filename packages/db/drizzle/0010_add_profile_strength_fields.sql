CREATE TYPE "public"."sex" AS ENUM('male', 'female');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sex" "sex";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birthdate" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "height_cm" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bodyweight" numeric(6, 2);
ALTER TABLE "users" ADD COLUMN "advanced_features" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
-- Everyone who already has an account has set the app up their own way, so
-- only users created after this migration get the walkthrough (issue #464).
UPDATE "users" SET "onboarded_at" = now() WHERE "onboarded_at" IS NULL;

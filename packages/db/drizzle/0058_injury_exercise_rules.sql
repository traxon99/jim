ALTER TABLE "injuries" ADD COLUMN "exercise_rules" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_injury_rules" boolean DEFAULT true NOT NULL;
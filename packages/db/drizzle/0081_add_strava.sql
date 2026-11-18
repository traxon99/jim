CREATE TABLE "strava_activities" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"strava_activity_id" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strava_activities_status_check" CHECK ("strava_activities"."status" IN ('queued', 'posting', 'posted', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "strava_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "strava_connections" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"athlete_id" text NOT NULL,
	"athlete_name" text,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"auto_post" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "strava_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "strava_post" boolean;--> statement-breakpoint
ALTER TABLE "strava_activities" ADD CONSTRAINT "strava_activities_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strava_activities" ADD CONSTRAINT "strava_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strava_connections" ADD CONSTRAINT "strava_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "strava_activities_user" ON "strava_activities" USING btree ("user_id");
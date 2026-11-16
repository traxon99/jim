CREATE TABLE "telemetry_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"message" text,
	"fingerprint" text,
	"value" double precision,
	"app_version" text,
	"path" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telemetry_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telemetry_events_kind_created" ON "telemetry_events" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "telemetry_events_fingerprint" ON "telemetry_events" USING btree ("fingerprint","created_at");--> statement-breakpoint
CREATE INDEX "telemetry_events_created" ON "telemetry_events" USING btree ("created_at");
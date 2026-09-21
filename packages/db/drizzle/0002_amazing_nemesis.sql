CREATE SEQUENCE "public"."sync_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "body_measurements" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "body_measurements" ADD COLUMN "device_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "body_measurements" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "body_measurements" ADD COLUMN "server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "personal_records" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "personal_records" ADD COLUMN "device_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "personal_records" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "personal_records" ADD COLUMN "server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD COLUMN "device_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD COLUMN "server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "device_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN "device_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN "server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "sets" ADD COLUMN "server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL;--> statement-breakpoint
CREATE INDEX "body_measurements_server_seq" ON "body_measurements" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX "exercises_server_seq" ON "exercises" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX "personal_records_server_seq" ON "personal_records" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX "routine_exercises_server_seq" ON "routine_exercises" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX "routines_server_seq" ON "routines" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX "session_exercises_server_seq" ON "session_exercises" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX "sessions_server_seq" ON "sessions" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX "sets_server_seq" ON "sets" USING btree ("server_seq");--> statement-breakpoint
-- drizzle-kit doesn't track grants. A bare CREATE SEQUENCE isn't covered by
-- Supabase's default table privileges, so every server_seq default (and the
-- push route's LWW-guarded upsert, which bumps it on UPDATE too) would
-- otherwise fail for the authenticated role with "permission denied for
-- sequence sync_seq".
GRANT USAGE, SELECT ON SEQUENCE "public"."sync_seq" TO authenticated, service_role;
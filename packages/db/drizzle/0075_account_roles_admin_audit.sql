CREATE TYPE "public"."account_role" AS ENUM('user', 'coach', 'admin');--> statement-breakpoint
CREATE TABLE "admin_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"target_user_id" uuid,
	"action" text NOT NULL,
	"field" text,
	"old_value" jsonb,
	"new_value" jsonb,
	"via" text DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "account_role" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_audit" ADD CONSTRAINT "admin_audit_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit" ADD CONSTRAINT "admin_audit_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_created" ON "admin_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_target" ON "admin_audit" USING btree ("target_user_id","created_at");--> statement-breakpoint
-- A signed-in user can never give themselves a role (issue #806). The web
-- app and the MCP server both write users rows as the `authenticated` role
-- (runAsUser), and so does PostgREST, so a role set or changed from there is
-- rejected. The server's own connection (the admin UI, after its admin check)
-- and the grant-admin script run as the owner and pass.
CREATE OR REPLACE FUNCTION users_guard_role() RETURNS trigger AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' AND NEW.role IS DISTINCT FROM 'user' THEN
      RAISE EXCEPTION 'users.role can only be set by an admin';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'users.role can only be changed by an admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER users_guard_role
BEFORE INSERT OR UPDATE ON "users"
FOR EACH ROW
EXECUTE FUNCTION users_guard_role();

-- Sets are append-only (ADR-003): editing writes a superseding row, deleting
-- writes a tombstone. Enforced here rather than trusted to callers, so it
-- holds even for a role that bypasses RLS (migrations, the seed script, a
-- future admin tool).
CREATE OR REPLACE FUNCTION reject_sets_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'sets rows are immutable (ADR-003): insert a superseding row via supersedes_id, or a tombstone via deleted_at, instead of UPDATE';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER sets_reject_update
BEFORE UPDATE ON "sets"
FOR EACH ROW
EXECUTE FUNCTION reject_sets_update();

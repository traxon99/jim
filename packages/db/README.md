# @jim/db

Drizzle schema, migrations, RLS policies, and the exercise catalog seed. See
[docs/ARCHITECTURE.md §4](../../docs/ARCHITECTURE.md) for the data model and
[docs/DECISIONS.md](../../docs/DECISIONS.md) for the RLS (ADR-005), sets-immutability
(ADR-003), and copy-on-write catalog (ADR-008) decisions this package enforces.

## Setup

Copy `.env.example` to `.env` and point `DATABASE_URL` at a Supabase Postgres
connection string (or any Postgres instance for local work — RLS policies
reference `auth.uid()` and `auth.users`, which Supabase provides; see
`test/bootstrap-supabase-stubs.sql` for a minimal local stand-in).

```
pnpm db:generate   # regenerate drizzle/ SQL from src/schema.ts after a schema change
pnpm db:migrate     # apply drizzle/ migrations to MIGRATE_DATABASE_URL (falls back to DATABASE_URL)
pnpm db:seed        # fetch free-exercise-db and upsert the global exercise catalog
```

`apps/web`'s `prebuild` script (`scripts/prebuild.mjs`) runs `db:migrate` and `db:seed`
automatically before every production `next build` (or any build outside Vercel), so deploys
apply pending migrations and keep the global exercise catalog current on their own. Vercel
preview builds skip it: they share the production database, and an unmerged branch must not
migrate it. Point `MIGRATE_DATABASE_URL` at the Supabase session pooler (not the
transaction pooler `DATABASE_URL` the app queries at runtime with) — drizzle's migrator takes
a session-scoped advisory lock that transaction-mode pooling doesn't support.

A hand-authored migration (`drizzle/0001_sets_reject_update.sql`) adds a trigger
that rejects any `UPDATE` on `sets` — `drizzle-kit generate` won't reproduce
this from the schema DSL, so don't regenerate over it. `drizzle/0023_friends_functions.sql` is
hand-authored for the same reason: it backfills usernames and adds the username trigger and the
SECURITY DEFINER friend functions (ADR-017), and `drizzle/0025_workout_reactions_functions.sql`
adds the workout-reaction functions the same way. `drizzle/0033_share_links_functions.sql` adds the
function that opens a routine or program share link (issue #254) the same way.

`drizzle/meta/_journal.json`'s `when` for `0007_last_starhawk` is deliberately earlier than
when that file was generated. Drizzle's migrator only runs migrations whose `when` is later
than the last one recorded in the database. Before the preview guard above existed, this
migration's SQL reached production under its earlier name, `0006_messy_mentor`, with
`when` 1790108464053. The journal reuses that timestamp so production treats it as applied
and doesn't re-run it. Don't "correct" it.

## Tests

Pure logic (muscle normalization, tracking-type classification) runs under
`pnpm test` with no setup. Integration tests (RLS isolation, the sets trigger,
the seed script) are skipped unless `TEST_DATABASE_URL` is set, and then drop
and recreate that database's schemas on every run — point it at a disposable
scratch database, never one with real data.

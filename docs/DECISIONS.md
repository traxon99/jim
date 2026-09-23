# Architecture Decision Records — Jim

Each record states the decision, what it rules out, and the alternative that was rejected.
The rejected alternative is recorded because in a year the reasoning will not be obvious,
and the cost of relitigating a settled decision is higher than the cost of writing it down.

Status values: **Accepted** · **Superseded** · **Proposed**

---

## ADR-001 — Local-first: IndexedDB is the source of truth

**Status:** Accepted · 2026-09-20

**Context.** The primary objective is logging a working set in under 3 seconds with no network.
Gyms are reliably signal-hostile: basements, concrete, steel.

**Decision.** IndexedDB (via Dexie) is the source of truth during use. Every mutation writes to
IndexedDB and appends to an outbox in a single transaction. The React layer reads only from
IndexedDB via live queries. A sync engine moves the outbox to Postgres out of band.

**Rejected: server-first with cached reads.** Far simpler — every set is an API call, a service
worker caches reads for offline viewing. Rejected because writes would require connectivity, and
"I cannot log this set right now" is the one failure this app must never produce. The complexity
of a sync engine is the price of the primary objective.

**Rejected: local-only, no server.** Simplest of all, but it rules out the live MCP server, which
is a stated requirement rather than a nice-to-have.

**Consequence.** We own a sync engine, an outbox, a conflict strategy, and idempotency. This is
the single largest source of risk in the project and is tested explicitly (see ADR-003).

---

## ADR-002 — Sync is foreground-driven, never event-driven

**Status:** Accepted · 2026-09-20

**Context.** The conventional local-first design registers a Background Sync event and lets the
service worker flush the outbox when connectivity returns.

**Decision.** Sync is triggered by app boot, `visibilitychange → visible`, `online`, a 60s interval
while foregrounded, and session finalize. A user-visible status indicator shows `synced` /
`pending N` / `error` at all times.

**Rejected: the Background Sync API.** It does not exist on iOS and never has. iOS also heavily
restricts background execution for web apps generally, so periodic background flush is not
available by any route. A design assuming background flush would appear to work in desktop Chrome
during development and silently lose data on the target device.

**Consequence.** Data is only pushed while the user has the app open. The status indicator is
therefore load-bearing, not decoration — it is how the user knows a workout is safe.

---

## ADR-003 — Sets are append-only and immutable

**Status:** Accepted · 2026-09-20

**Context.** Offline-capable multi-device systems need a conflict story. The general solutions
(CRDTs, operational transform) are heavy.

**Decision.** `sets` rows are never `UPDATE`d. Editing a set inserts a new row carrying
`supersedes_id`; deleting writes a `deleted_at` tombstone. Sessions and routines use last-write-wins
tie-broken on `(updated_at, device_id)`. Primary keys are client-generated UUIDv7.

**Rejected: a CRDT library.** Correct in full generality and considerable weight to carry. The
actual usage pattern is one person, on one phone, in one gym, doing one workout at a time. Genuine
concurrent edits to the same set essentially do not occur. Making conflicts structurally impossible
for the high-volume entity, and accepting LWW for low-volume ones, gets the needed correctness at a
fraction of the cost.

**Consequence.** The `sets` table grows monotonically, including superseded rows. At personal-training
volume this is trivially small — a few thousand rows a year. Queries must filter
`deleted_at IS NULL` and resolve supersede chains; this belongs in `packages/core` so it is written once.

---

## ADR-004 — Next.js 16 + Supabase + Drizzle on Vercel

**Status:** Accepted · 2026-09-20

**Context.** Single user. Cost and operational burden matter far more than scale.

**Decision.** Next.js 16 App Router for the PWA, Supabase Postgres for storage and auth, Drizzle
for schema and migrations, deployed on Vercel. The MCP server is a separate deployable against the
same database.

**Rejected: SvelteKit.** A genuinely lighter runtime and smaller bundle, which matters for a PWA.
Rejected on ecosystem depth — the component and charting libraries wanted here are better served in
React, and bundle size is addressable through other means.

**Rejected: self-hosted Docker + Postgres on a VPS.** Full control and no vendor lock-in, at the
cost of owning backups, TLS and uptime for a personal app. Supabase's free tier covers a single
user indefinitely. Drizzle keeps the schema portable if this is revisited.

---

## ADR-005 — Multi-tenant RLS from day one

**Status:** Accepted · 2026-09-20

**Context.** One user today, possibly friends later.

**Decision.** Every user table carries `user_id` with an RLS policy of `user_id = auth.uid()`,
enforced from the first migration.

**Rejected: single-user schema, retrofit tenancy later.** Retrofitting tenancy means touching every
table, every query and every endpoint, and the failure mode of getting it wrong is showing one
person another's data. The incremental cost now is one column and one policy per table.

**Consequence.** The MCP server must authenticate as a user rather than hold a service-role key
(ADR-006). Sharing features later are a feature, not a migration.

---

## ADR-006 — The MCP server authenticates as the user

**Status:** Accepted · 2026-09-20

**Context.** The MCP server needs database access and is network-exposed.

**Decision.** Streamable HTTP transport with OAuth 2.1 via the official TypeScript SDK's
`authProvider`. The server holds a user token and is subject to the same RLS as the web app.

**Rejected: a Supabase service-role key.** Substantially simpler to wire up. Rejected because a
service-role key bypasses RLS entirely — it is a standing, full-database credential living in a
network-exposed process, and any flaw in the MCP layer becomes total data compromise. Authenticating
as the user means an MCP bug is bounded by that user's own data.

---

## ADR-007 — MCP cannot mutate an in-progress session

**Status:** Accepted · 2026-09-20

**Context.** The MCP tool surface covers reading history, writing routines and managing the catalog.
Live set logging from the agent side was considered.

**Decision.** MCP writes are limited to routines, scheduling and the exercise catalog. The live
session is owned exclusively by the phone.

**Rejected: live set logging over MCP.** It reintroduces exactly the concurrent-writer problem that
ADR-003 was designed to avoid, on the one entity where a conflict actively harms the user — a
workout in progress. The benefit is marginal: the phone is already in hand during a set. Deferred to
the backlog as "multi-device live session handoff," to be revisited once the sync engine has proven
itself in real use.

---

## ADR-008 — Seeded exercise catalog with copy-on-write user edits

**Status:** Accepted · 2026-09-20

**Context.** "Dynamic exercise catalog" needs a concrete meaning. An empty catalog makes the first
month tedious and analytics weak until it fills.

**Decision.** Seed roughly 800 exercises from [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
(public domain) as global rows with `owner_id IS NULL`. Users create their own rows freely. Editing
a global seed row clones it into a user-owned row — copy-on-write.

**Rejected: mutable shared seed rows.** Simpler, but a user edit would alter a row shared by every
future user, and reseeding would clobber personal edits. Copy-on-write keeps the seed reseedable
forever.

**Rejected: an empty, fully user-built catalog.** Cleanest data and the worst first month.

**Consequence.** Queries against `exercises` filter `owner_id IS NULL OR owner_id = auth.uid()`,
preferring the user-owned row where a clone exists. This belongs in one shared query helper.

---

## ADR-009 — Apple Health is out of scope

**Status:** Accepted · 2026-09-20

**Decision.** No HealthKit integration.

**Rationale.** A PWA has no HealthKit access. None. The only available route is manually exporting
Health data as XML and importing the file, which is periodic and manual rather than live. Recorded
here so the question is answered once rather than revisited each time bodyweight tracking comes up.
An Apple Health XML importer sits in the backlog as the honest version of this feature.

---

## ADR-010 — The app hard-gates on home-screen install

**Status:** Accepted · 2026-09-20

**Context.** iOS evicts storage for non-installed web apps after 7 days of non-use. Home-screen
installed PWAs are exempt.

**Decision.** When `display-mode` is not `standalone`, the app shows install instructions rather
than accepting data.

**Rejected: a dismissible install banner.** The friendly option, and it means a user who dismisses
it can log three weeks of training in a Safari tab and lose all of it after a week away from the
gym. Web Push and reliable storage both require install regardless. As of iOS 26 anything added to
the Home Screen opens as a web app by default, so the gate costs the user one interaction, once.

---

## ADR-011 — App version is counted from commits, major/minor picked by hand

**Status:** Accepted · 2026-09-23

**Context.** Every merge to `main` deploys (ADR-004), and the app had no version number to tell
one deploy from another.

**Decision.** `apps/web/version.json` holds a hand-picked `major` and `minor`. The patch number is
computed at build time as the number of commits the deployed commit is ahead of the last commit
that changed `version.json` (`lib/version/resolve.ts`), then inlined as `NEXT_PUBLIC_APP_VERSION`.
Bumping the major is a one-line edit to `version.json`, and the patch resets to 0 in that same
commit. Vercel's clone is shallow, so there the count comes from the GitHub compare API
(`GITHUB_VERSION_TOKEN`, Contents: read); local builds use `git`. When neither works the build
still succeeds, as `<major>.<minor>.0-dev`.

**Rejected: a CI job that commits a bumped version on every merge.** Each bump commit would trigger
another deploy, and it adds bot commits to history. A count derived from existing commits needs no
extra writes.

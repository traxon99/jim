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

---

## ADR-012 — Update notifications are Web Push, sent by the production build

**Status:** Accepted · 2026-09-24

**Context.** The "Jim updated" notification used to be raised by the page's own JavaScript when it
saw a new service worker installing. That only happens while Jim is open, so a closed app never
heard about an update, which is when the notification is useful.

**Decision.** Real Web Push. Settings → Notifications asks for permission, subscribes via
`PushManager` with the VAPID public key (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`), and stores the
subscription in `push_subscriptions` (own-row RLS, ADR-005) through `/api/push/subscription`. Every
app load re-posts the current subscription so the server's copy doesn't go stale. The service
worker re-subscribes on `pushsubscriptionchange`. After each production build,
`scripts/send-release-push.ts` (postbuild) reads every subscription as the migration role, pushes
`LATEST_RELEASE_NOTE` through each browser's push service, and deletes endpoints that answer 404/410.
The service worker's `push` handler shows the notification without any page running, and asks for
an update check so the new version precaches in the background.

The send happens at the end of the build, shortly before Vercel points the domain at the new
deployment. A tap in that gap can still open the previous version, and the next launch then
reloads into the new one (register-service-worker.tsx). Sending never fails a build. Without VAPID
keys it's skipped, and the Settings toggle says push isn't set up.

**Rejected: periodic background sync.** Chromium-only, not on iOS, and the browser picks the
interval. **Rejected: a deploy webhook calling an API route.** It sends at a better moment, but it
needs a public, secret-guarded endpoint plus webhook config outside the repo. The build already has
the database credentials and runs exactly once per production deploy.

---

## ADR-013 — Rest timer completion shows a local notification, not a server push

**Status:** Superseded by ADR-014 · 2026-09-24

**Context.** The rest timer (`packages/core/src/sessions/rest-timer.ts`) is entirely client-side
and foreground-driven, per constraint 4 (`docs/ARCHITECTURE.md` §2): it derives remaining time from
a stored absolute timestamp, recomputed on every render, and there is no reliable background
execution to hang a `setTimeout` off. Its completion previously only played an audio alert
(`lib/audio/rest-alert.ts`), which a backgrounded or unfocused tab can't be heard from.

**Decision.** When the timer completes, call `ServiceWorkerRegistration.showNotification()`
directly from the page (`lib/pwa/push-client.ts`'s `showLocalNotification`), reusing the service
worker already registered for Web Push (ADR-012) but skipping the push service entirely — no
network round trip, no VAPID, no `push` event. This still surfaces as a system notification even
when Jim isn't the focused tab, unlike an in-page toast, because it's the same underlying API the
`push` handler uses to display a message it received. It's gated on the same
`Notification.permission === "granted"` the Settings → Notifications toggle already establishes,
and never itself prompts. `sw.template.js`'s existing `notificationclick` handler needed no changes
— it opens/focuses by `data.url` regardless of what raised the notification.

**Rejected: a real server-sent Web Push for this too.** It would need the server to know exactly
when a given rest period ends and to fire a message at that instant — either a delayed job per
timer start (this repo has no queue/cron infra to schedule one) or a serverless function sleeping
for the rest duration (wastes function time, unreliable past a few minutes, and still couldn't beat
the precision of just asking the already-running page). The timer's completion instant is only ever
known client-side, so showing the notification client-side is the direct path, not a compromise.

---

## ADR-014 — Rest timer completion is a server push, scheduled through QStash

**Status:** Accepted · 2026-09-24 · Supersedes ADR-013

**Context.** ADR-013 fired the "Rest complete" notification from the page, on the assumption that
the page is still running when the rest ends. On a phone it usually isn't: iOS suspends a
backgrounded or screen-locked PWA's JavaScript (constraint 4, `docs/ARCHITECTURE.md` §2), so the
tick that notices the rest is over only runs once the user reopens Jim. The notification then
arrives on return, not at the end of the rest, which is exactly when it isn't needed.

**Decision.** When a rest starts, the page POSTs its `endsAt` and its own push subscription's
endpoint to `/api/push/rest-timer`. The server records it in `rest_timer_pushes` (one row per
user) and publishes an Upstash QStash message with `notBefore = endsAt`. At that instant QStash
calls `/api/push/rest-timer/fire`, which verifies QStash's signature, deletes the row only if it
still has the same `ends_at`, and sends a Web Push to that one device (`TTL` 60 s, high urgency).
The service worker's `push` handler shows it like any other push, so it arrives with Jim closed.

- **Skip, restart, finish, cancel.** A new rest upserts the row; skipping, finishing, or
  cancelling the workout deletes it. The stale QStash message still arrives but finds no matching
  row and does nothing, so nothing ever needs cancelling at QStash.
- **Fallback.** If the push couldn't be scheduled (no subscription on this device, QStash or VAPID
  not configured, offline, development), the page still shows ADR-013's local notification when it
  next runs. When the push *was* scheduled, the page skips its local one so it isn't shown twice.
  The audio alert plays either way when the page is running.
- **Only this device.** The push goes to the endpoint that started the rest, not every device the
  user has subscribed, so a laptop doesn't chime for a set on the phone.

**Rejected: Supabase `pg_cron` polling for due rows.** No new vendor, but it needs `pg_net` and a
shared secret configured in the database outside migrations, and its precision is the poll
interval. QStash's delayed delivery is second-precise, and its free tier covers far more rests
than one app's users log.

**Rejected: a serverless function sleeping until `endsAt`.** Pays for idle function time per rest
and is cut off by function duration limits on long rests (ADR-013's reasoning still holds here).

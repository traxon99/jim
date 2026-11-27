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

**Amendment (2026-09-30, #246): personal access tokens.** A client may also authenticate with a
personal access token the user created in Settings. The token stands in for the user's sign-in, not
for a service-role key. The server stores only its hash, resolves it to one user id through a
narrow SECURITY DEFINER function, and then runs under that user's RLS as before. A revoked or
expired token stops working on the next request.

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

**Amendment (2026-09-30, #244): logging a finished workout.** `log_past_workout` lets an agent
record a workout that is already over ("I forgot my phone, here's what I did"). It only ever inserts
a new session whose `ended_at` is set and in the past, together with its exercises, sets and PRs.
It never reads or writes an in-progress session, so there is still only one writer for the live
workout, and the reasoning above is unchanged.

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
An Apple Health XML importer is the honest version of this feature: Profile → Bodyweight reads the
Health app's `export.zip` (issue #247), streaming `export.xml` out of the zip so a large export
never sits in memory whole.

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
Since #668 it only sends to users with What's new on, only a note that changed, and at most once a
day (`release_pushes` records each send). Since #702 users can pick every deploy instead
(`push_whats_new_every_deploy`): they get each new note on the deploy that ships it, tracked as
its own `release_pushes.audience`.
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

---

## ADR-015 — The web portal reads from the server and skips the install gate

**Status:** Accepted · 2026-09-24

**Context.** Issue #38 asks for a web portal for detailed analysis of strength numbers and other
metrics — something to look at on a computer, not just a 393px phone. The app is local-first
(IndexedDB, ADR-001) and hard-gated on home-screen install (ADR-010), so a desktop browser only
ever sees install instructions.

**Decision.** `/portal` is a server component outside the `(shell)` group. It reads sessions,
session exercises, sets and exercises straight from Postgres under the signed-in user's RLS scope
(`withUserDb`), and hands them to a client dashboard that computes everything with `packages/core`
(`summarizeTraining`, `strengthTrends`, `weeklyVolumeTotals`, built on the same
`estimatedOneRepMaxSeries` as the phone's exercise chart). The install gate lets `/portal` through,
along with `/login` and `/signup` when their `next` is the portal.

- **Read-only.** The portal never writes and never opens IndexedDB, so ADR-010's reason for the
  gate — data logged in a browser tab being evicted — doesn't apply to it.
- **Server data, not local.** It shows what has synced. Sets still waiting in the phone's outbox
  appear after the next push; the portal isn't where training is logged.
- **Also in the app.** History links to it, so the same view is one tap away on the phone.

**Rejected: un-gating the whole app on desktop.** It would let someone log a workout into a
browser's IndexedDB that nothing protects from eviction — exactly what ADR-010 exists to prevent.

## ADR-016 — Dynamic Progression replaces the fixed weekly increment

**Status:** Accepted · 2026-09-26

**Context.** Routine exercises could add a fixed amount to their target weight every week
(`progressionIncrement` / `progressionStartedAt`, issue #98). That number kept climbing whatever
happened in the gym: a missed week, a grinder at RPE 10 or a layoff all left it on schedule, so the
"this week's target" chip drifted away from what the lifter could actually do. Dynamic Progression
(DPR, epic #207) makes the same call from what was actually logged: reps against the routine's
range, RPE, the current weight and time off.

**Decision.** DPR is the only automatic progression (custom per-exercise rules came later, one system per lift: ADR-019). The weekly increment's UI, the `@jim/core`
`weekly-progression` module and the two `routine_exercises` columns are removed (migration 0019).
`targetWeight` stays as the starting weight for an exercise with no history. DPR is opt-in and
covers up to 5 focused lifts. Every other lift keeps the plain "last time" prefill, falling back to
`targetWeight`.

- **Calls are derived, not stored.** DPR stores only its config (settings, blocks and focus). Each
  call is a pure `@jim/core` function of the set history, so logging stays append-only (ADR-003)
  and the decision log can always be replayed.
- **Suggestions, not writes.** The DPR weight is a placeholder the lifter can type over, and DPR
  learns from whatever was logged.

**Rejected: keeping both.** Two automatic systems suggesting different weights for the same lift
would leave the lifter guessing which to trust. The weekly increment's one advantage, needing no
RPE, isn't worth that.

---

## ADR-017 — Friends read each other's workouts through SECURITY DEFINER functions, not RLS

**Status:** Accepted · 2026-09-28

**Context.** Issue #35 adds friends: find someone by their exact username, send a request, and once
it's accepted see their finished workouts on the Home tab. That's the first read that crosses users.
ADR-005 anticipated it ("sharing features later are a feature, not a migration"). But
`/api/sync/pull` selects every syncable table under RLS with no `user_id` filter of its own. A
policy that let a friend's `sessions` or `sets` through would copy them into this user's IndexedDB
on the next pull, where they'd show up as the user's own history.

**Decision.** The syncable tables keep their own-rows-only policies. Migration 0023 adds
`SECURITY DEFINER` functions that act for `auth.uid()` alone and check the friendship themselves:
`send_friend_request`, `respond_to_friend_request`, `remove_friend`, `list_friends` and
`friend_workouts`. The last returns a per-session summary (exercises with set counts and the top
set), not raw rows. `friendships` is readable by its two users and has no write policies, so the
functions are the only way to change it. They're executable by `authenticated` only.

- **Usernames** are lowercase and unique, and matched exactly, so there's no directory to browse.
  Every user starts with their email's local part (a number is added on a clash, oldest account
  first). A trigger fills it for new rows, and Profile lets the user change it.
- **Server data, not local-first.** Friends and their workouts are read from `/api/friends*` when
  Home is shown, like the portal (ADR-015). Nothing about a friend is written to IndexedDB, so
  offline the panel says it can't load rather than showing stale data.

- **Reactions** (issue #303) follow the same rule. `workout_reactions` is readable only by the
  person who reacted and has no write policies. Migration 0025's `toggle_workout_reaction` only
  accepts an accepted friend's finished, undeleted session; `friend_workouts` now returns each
  workout's per-kind counts and whether you reacted; and `workout_reactions_received` shows a
  session's owner who reacted to which of their workouts.

- **Profile pictures, posts and sharing settings** (issue #316) follow it too. The picture is a
  small square JPEG data URL on `users.avatar`, cropped and shrunk on the phone, so there's no file
  storage. `posts` (a workout, record or achievement, with an optional caption) is readable only by
  its author and has no write policies: migration 0031's `create_post` checks a linked workout is
  the author's own finished one, `delete_post` removes only your own, and `friend_posts` hands
  friends theirs. `users.share_workouts` and `share_workout_details` are read by the recreated
  `friend_workouts`, which leaves out a friend's workouts, or just their exercises, when they've
  turned sharing off. Posts are shared one at a time on purpose, so they show either way. These
  live on `/api/profile`, not the IndexedDB-cached settings row, like the username.

- **Leaderboards** (issue #837) follow it as well. Migration 0080's `friend_lift_leaderboard(slug,
  machine)` and `friend_leaderboard_lifts()` rank you and your accepted friends from
  `personal_records`, the same cache the PR page reads, so a friend's e1RM matches their own PR
  page. Lifts match on catalog slug (a clone keeps its seed's); a machine exercise also needs the
  same make and model and a pinned gym within 150 m. A participant needs `users.share_leaderboards`
  (default on) and `share_workouts`; `share_relative_strength` (default off) adds best e1RM over
  bodyweight, computed inside the function so the bodyweight never leaves it. All three live on
  `/api/profile`. The MCP stays own-user (ADR-006): no tool reads a friend's board.

**Rejected: friend-aware RLS on `sessions`/`session_exercises`/`sets`.** Simpler SQL, but every pull
would need an explicit `user_id = me` filter, and forgetting it anywhere (the pull route, the MCP
server, the portal) silently merges someone else's training into yours.


---

## ADR-018 — Coach / client mode: no-go for now

**Status:** Accepted (no-go) · 2026-10-05

**Context.** Issue #256 asks whether Jim should let a coach program for a client and watch their
logs, as Hevy Coach and Boostcamp do. The proposed shape: a coach relationship table whose policies
let the coach read the client's sessions and write their routines and programs; the coach works from
`/portal` or MCP; the client's phone is unchanged and the live session stays phone-only (ADR-007);
the client owns consent and revocation.

**Finding: it's feasible, and smaller than it looks.** The plumbing mostly exists.

- **Reads** would follow ADR-017, not RLS. The syncable tables must keep their own-rows-only
  policies, because `/api/sync/pull` selects them with no `user_id` filter: a coach-readable policy
  on `sessions`/`sets` would copy every client's training into the coach's IndexedDB. A
  `SECURITY DEFINER` `coach_client_workouts(client_id)` that checks an active relationship, like
  `friend_workouts`, avoids that, and the portal already renders server data (ADR-015).
- **Writes** need no new sync path. MCP's `create_routine`/`update_routine` already write routines
  into the user's own rows with a fresh `server_seq` and `device_id = 'mcp-server'`, and the phone
  picks them up on its next pull. A coach write is the same insert with `user_id` set to the client,
  done by a definer function (`coach_upsert_routine`, `coach_assign_program`) that checks the
  relationship and only touches `routines`, `routine_exercises`, `programs` and `program_routines`.
- **Consent.** A `coach_clients` table (`coach_id`, `client_id`, `status`, `created_at`,
  `revoked_at`), readable by both users with no write policies, changed only through
  `invite_coach` / `accept_coach` / `revoke_coach`, where only the client can accept or revoke.
  Revocation takes effect on the coach's next call because every function re-checks it.

**What makes it more than a migration.** Each of these is solvable, but together they are real work
and real risk for a feature nobody uses yet:

- **It's the first cross-user write.** Everything shared so far (friends, reactions, posts) is a read
  or a write to your own rows. A coach writing into a client's account is the first path where a bug
  edits someone else's data, which is the failure ADR-005 exists to prevent.
- **Last-write-wins between two people.** Routines are LWW on `(updated_at, device_id)` because it's
  "one person, one phone" (ARCHITECTURE §3). A coach editing a routine while the client tweaks it on
  the phone silently drops one side. Coach-owned routines would need to be read-only on the phone, or
  copied rather than shared, which is UI work on the phone the issue wanted to avoid.
- **Exercise visibility.** A coach's custom exercise has `owner_id = coach`, so it's invisible to the
  client under ADR-008's policies and a routine pointing at it breaks on the phone. Coach routines
  would be limited to seed exercises, or the function would have to copy exercises into the client.
- **MCP identity.** A personal access token resolves to one user (ADR-006). A coach acting for
  several clients needs a `client` argument on every write tool, checked server-side, plus a way to
  see which account an agent just changed.
- **Product.** Coach discovery, invites, a client list in the portal, and what the client sees when a
  routine changes under them. Hevy charges $25+/mo for this because it's a product of its own.

**Decision.** No-go. Jim stays a personal app. Nothing is built for coaching, and no schema is added
speculatively. The design above is the plan of record if it's revisited.

**Revisit when** a real coach/client pair wants to use Jim, or when Jim gains a second cross-user
write for another reason (that feature would pay for the relationship-checked definer pattern, the
read-only-routine UI and the MCP `client` argument).

**Rejected: coach-aware RLS on the syncable tables.** Fewer functions, but it has ADR-017's flaw:
every pull, portal query and MCP read would need an explicit `user_id = me` filter, and missing one
merges a client's training into the coach's history.

**Rejected: building it now as a go.** The plumbing makes the first demo cheap, but the cost is in
the parts above, which a single-user app would carry and test with no one exercising them.

---

## ADR-019 — Custom progression rules are a second system, one per lift

**Status:** Accepted · 2026-10-05

**Context.** DPR (ADR-016) has three presets and decides from RPE. Programs like GZCLP, 5/3/1 or a
plain double progression spell out their own rules: add X after a success, change the rep scheme
after a miss, drop Y% after N misses. Rewriting routines over MCP covered some of that, but not for
users without an MCP client (issue #255).

**Decision.** A routine exercise can carry a structured rule in `routine_exercises.progression_rule`
(jsonb, migration 0032): `linear` (optionally stepping through rep schemes on a miss, like GZCLP's
5×3 → 6×2 → 10×1), `double` (reps up the routine's range, then weight) or `reps_sum` (weight once the
working sets' reps reach a total, like GZCLP T3's 3×15+), each with an optional "after N misses,
drop Y%" deload. No scripting language: these options cover the common programs.

- **Derived, like DPR.** Only the rule is stored. `decideProgression` in `@jim/core` replays the
  exercise's history oldest first against what the rule asked for, so logging stays append-only
  and the call is a suggestion the lifter can type over. A weight other than the one asked for
  becomes the new starting point. Light sessions don't count. No RPE is needed.
- **One automatic system per lift.** ADR-016's reason for removing the weekly increment still
  holds, so a lift never gets both calls. The routine editor and MCP refuse a rule on a lift that
  DPR is focusing on. If both happen anyway (edits on two offline devices), the rule wins and
  `dprCallFor` returns null for that lift (`progressionSystemFor`).
- **Per routine exercise, not per lift.** A lift that's T1 on one day and T2 on another can have a
  different rule in each routine. The replay reads every session of the exercise, whatever routine
  it came from.

**Rejected: a Liftoscript-style language.** It would be more expressive, but it's hard to edit on a
phone and hard to check, and the structured options already express the programs people asked for.

## ADR-020 — Share links are readable by anyone who has the link

**Status:** Accepted · 2026-10-14

**Context.** A share link (issue #254) only opened in the installed, signed-in app. A friend without
Jim, or someone on a computer, got sign-in or the install gate, and the chat preview (#431) showed
a few names at most. The ask (issue #638) was that anyone can open the link and read the routine.

**Decision.** `/share/<id>` and its preview image are public paths in the proxy and skip the install
gate. Signed out, the page renders the snapshot on the server (`loadSharePreview`, the server's own
connection, narrowed to one link by its id) with no tab bar or sync engine. Signed in, the page is
the existing preview; in a browser tab it hides "Add", since adding writes to IndexedDB, which only
the installed app keeps (ADR-010). `/api/shares/*` still takes signing in.

- **The link is the capability.** Ids are random UUIDs and revoking a link still stops it working.
  The snapshot holds only what the sharer chose to share (names, targets, notes), and the page
  sends `noindex`.


---

## ADR-021 — Idle workouts end on the phone; the server only sends the alerts

**Status:** Accepted · 2026-10-19

**Context.** A workout left open after the user walks out keeps running for hours and wrecks its
duration (issue #648). The user wants a "Still working out?" push after 10 minutes with nothing
logged, a setting to end workouts automatically after a period of no activity (default 1 hr), and
a push saying the workout ended.

**Decision.** The phone ends the workout; the server only times the pushes.

- **Last activity** is the latest of the workout's start, its own edits, its exercises' edits and
  its sets' `completedAt` (`lastWorkoutActivity` in `@jim/core`).
- **Pushes.** `WorkoutIdleWatcher` (mounted in the shell, so any tab works) posts the active
  workout's last activity to `/api/push/workout-idle` whenever it moves. The server keeps one
  `workout_idle_pushes` row per user and publishes a QStash message for 10 minutes later; that
  callback sends "Still working out?" and publishes the "Workout ended" one for the auto-end time.
  Each callback sends only while the row still has the same `last_activity_at`, and the server's
  copy of the session isn't ended or deleted, exactly as ADR-014 invalidates stale rests. Finishing,
  cancelling or auto-ending deletes the row.
- **Ending.** The watcher ends a workout idle past `users.auto_end_workout_minutes` on launch, on
  returning to Jim and once a minute while open, with `ended_at` set to its last activity, so the
  idle time never counts. Only the device that owns the session (its `device_id`) does this, since
  another device may not have its latest sets yet.

**Rejected: ending the session on the server when the "ended" callback fires.** ADR-007 keeps the
live session phone-owned, and a server write would race sets the phone hasn't synced yet. The cost
is that the portal and MCP show the workout as in progress until the phone next opens Jim; the push
still arrives on time, and the workout's recorded end is the same either way.

---

## ADR-022 — Jackson OS reads Jim through a versioned read-only REST API

**Status:** Accepted · 2026-11-04

**Context.** [Jackson OS](https://github.com/traxon99/jackson-os), Jackson's personal dashboard,
wants to show Jim training data: this week against last, the streak, recent workouts, PRs, lift
trends, bodyweight and what's planned next (issue #734). It polls from its own server on a
schedule and keeps a token in its `JIM_PAT` secret.

**Decision.** Jackson OS's server calls a small **versioned JSON REST API (`/v1/*`) served by
`apps/mcp`**, authenticated with a **read-only personal access token**.

- **Host.** `apps/mcp` is already a persistent Express process on Fly (`jim-mcp.fly.dev`), already
  verifies `jim_pat_` bearer tokens and already holds the read queries (`weekly-summary.ts`,
  `list-workouts.ts`, `get-prs.ts`…). Each `/v1` handler calls the same function its MCP tool
  does, so the dashboard and Claude can't disagree on a number (the same idea as "Shared
  computation" in ARCHITECTURE §4).
- **Auth.** A new `read` token scope (#736). The token runs every query as its owner under RLS,
  exactly like the MCP PAT path (ADR-006). No service-role key. A `read` token can also call the
  MCP read tools; every MCP write tool refuses it.
- **Read only.** Jackson OS can't start, edit or end a workout. The phone owns the live session
  (ADR-007), and `/v1/status` shows an in-progress workout for display only. Writes from Jackson
  OS (say, logging a body measurement) would be a separate decision with a separate scope.
- **Server-to-server only.** No CORS headers; no browser ever holds the token.
- **Versioning.** Responses have zod schemas in `@jim/core` (`packages/core/src/api/`), which
  Jackson OS mirrors. Within `/v1` changes are additive only; a breaking change means `/v2`.
  `docs/API.md` documents every endpoint.

**Rejected: Jackson OS as an MCP client.** It works today, but MCP tools return pretty-printed JSON
inside a text block with no stable schema, need a session handshake per call, and take
prompt-oriented arguments. A dashboard polling on a schedule wants typed, cacheable, versioned
responses.

**Rejected: Next.js route handlers in `apps/web`.** These run as Vercel functions, and the web
app's auth is Supabase sessions, not personal access tokens.

**Rejected: direct Postgres or Supabase reads from Jackson OS.** That puts a standing database
credential outside Jim and duplicates the core logic that computes volume, streaks and e1RM.

## ADR-023 — Account roles and an admin console

**Status:** Accepted · 2026-11-16

**Context.** Jackson needs a place to see platform health and act on other accounts (change
settings, refresh an app) without impersonating anyone, and a role model that can grow a coach
tier later (issue #805).

**Decision.**

- **Roles live in Postgres.** `users.role` is `user | coach | admin`, default `user`. The
  `users_guard_role` trigger rejects any insert or update of `role` made as `authenticated` or
  `anon`, so neither the app, the MCP server (both run as the user via `runAsUser`) nor PostgREST
  can promote anyone. The role is read from Postgres on each admin request, not from the JWT, so a
  demotion takes effect at once.
- **Admin is script-only.** `pnpm --filter @jim/web admin grant-admin|revoke-admin|clear-mfa
  <email>` runs on the migration role. The admin UI can only set User or Coach.
- **`/admin` is a web area like the portal (ADR-015).** Server-rendered, no sync engine or
  IndexedDB, exempt from the install gate. Not linked from the PWA; the portal nav shows an Admin
  link to admins.
- **TOTP for admin only.** Every admin page needs an `aal2` session (Supabase TOTP). The workout app
  and portal keep password sign-in. Non-admins get a 404, so the area doesn't reveal itself.
- **Admin reads and writes use the server's own connection, after the admin check.** RLS can't
  express "an admin may read anyone", and an admin policy on every table would widen the blast
  radius of a policy bug. Every admin write goes into `admin_audit` (RLS on, no policies) in the
  same transaction.
- **No training data.** Admins see account facts and counts, never workouts, and can't edit them.
- **The MCP admin tools (#811) hold the same TOTP bar.** The MCP sign-in asks an account with an
  authenticator app for its code, so the OAuth session it issues is `aal2`. Admin tools are listed
  and run only for an admin on an `aal2` session; personal access tokens carry no MFA state and
  never get them. Writes are audited with `via: "mcp"`.

**Rejected: a role claim in `app_metadata`.** It goes stale until the token refreshes, and it puts
the source of truth outside the database the guard trigger protects.

**Rejected: impersonation ("view as").** It would expose training data and blur who did what in the
audit log.

---

## ADR-024 — Strava sync posts finished workouts from the server

**Status:** Accepted · 2026-11-18

**Context.** Lifters who also run or ride want Jim workouts on Strava (issue #836). Strava's create-activity
API has no per-set fields, can't delete an activity, and needs OAuth tokens that must not reach the phone.

**Decision.**

- **Server-side OAuth.** `GET /api/strava/connect` redirects to Strava's sign-in with scope
  `activity:write` and a signed `state` (user id, timestamp, HMAC); `/api/strava/callback` verifies it for the
  signed-in user, exchanges the code and stores the connection. Jim never sees a Strava password.
- **Tokens are server-only.** `strava_connections` and `strava_activities` have RLS on and **no
  policies**, so the phone and PostgREST can't read them; routes reach them on the server's own connection
  after the signed-in or signature check (the ADR-023 pattern). Tokens are AES-256-GCM under
  `STRAVA_TOKEN_KEY`, refreshed on use within 5 minutes of expiry.
- **Trigger.** After `/api/sync/push` commits (and after MCP `log_past_workout`), the server queues each
  ended, undeleted session that should post: the user is connected, the Settings switch or the session's own
  `sessions.strava_post` (null follows the switch, false skips, true posts) says so, and the workout ended after
  the connection was made, so history from before connecting is never back-posted. A hand-picked workout
  (`strava_post = true`) and one logged through Claude skip that date check. Publishing happens after the
  commit and can never fail the sync.
- **Idempotency.** `strava_activities` is keyed by session. The QStash callback (`/api/strava/post`, signed like
  ADR-014's) claims the row `queued|failed → posting` in one statement and calls Strava only when the claim
  succeeds, so retries, concurrent deliveries and double syncs post once. The row outlives a deleted workout,
  so a restore never posts again. Posts are delayed 20 seconds so the finish screen's toggle can still skip one;
  the callback re-reads the session and drops the row if it was turned off.
- **Failures.** 429 and 5xx answer 503 so QStash backs off and retries; a 401 means access was revoked and
  deletes the connection; anything else leaves the row `failed`, shown on the workout as "Couldn't post to
  Strava" with Retry.
- **Webhook.** `POST /api/strava/webhook` hears an athlete's deauthorization. Strava doesn't sign events, so
  the event only prompts a check: the stored token is tried against Strava and the connection is deleted only
  if Strava rejects it. `GET` is the subscription handshake (`STRAVA_WEBHOOK_VERIFY_TOKEN`). Create the
  subscription once with `curl -X POST https://www.strava.com/api/v3/push_subscriptions -F client_id=… -F
  client_secret=… -F callback_url=https://<app>/api/strava/webhook -F verify_token=<verify token>`.
- **Payload.** `stravaActivityFor` in `@jim/core` is pure: WeightTraining, or the cardio sport when every
  working exercise is cardio of one sport (Workout for mixed cardio), the workout's name, start and elapsed
  time, one description line per exercise (working sets, 🏆 on PRs, warm-ups left out, capped under Strava's
  limit). Nothing about injuries, sick days or bodyweight is sent.
- **Deleting.** Strava's API can't delete an activity, so deleting a posted workout shows its Strava link
  instead of offering to remove it there.

**Rejected: posting from the phone.** The tokens would have to live in IndexedDB, and a workout finished
offline would only post when the app is next opened.
## ADR-025 — Progress photos are private and live in Storage, not Postgres

**Status:** Accepted · 2026-11-18

**Context.** Lifters want progress photos next to their bodyweight (issue #835). Photos are the most
sensitive thing Jim stores, and the first thing that is binary and large.

**Decision.**

- **Metadata syncs; bytes don't.** `progress_photos` is an ordinary own-row, last-write-wins synced
  table (ADR-005). The image bytes go to a private Supabase Storage bucket, `progress-photos`,
  under `<user_id>/<photo_id>/…`, with `select`/`insert`/`delete` policies that check the first path
  segment against `auth.uid()`. No public URLs; reads use short-lived signed URLs.
- **Blobs get their own queue.** The mutation outbox holds small JSON rows, so pending photo bytes
  wait in a separate Dexie table drained on the same foreground triggers (ADR-002). The row's
  `uploaded_at` is written only after both objects land, and an upload that finds its object already
  stored counts as done.
- **Strip metadata on the phone.** The photo is re-encoded through a canvas before upload, which
  drops EXIF (location, camera). Only the capture date is read first, to pre-fill the day.
- **Never shared.** No friend function, post, share snapshot or card, MCP tool or `/v1` endpoint reads
  the table, and a guard test fails CI if one starts to. They are in the JSON export and the Export
  photos zip, and the account's Storage prefix is removed by the admin deletion script.
- **No service role in the app.** The push route removes a deleted photo's objects as the signed-in
  user, over the same delete policy. Only the admin script, run by hand, holds the service-role key.

**Rejected: bytes in Postgres.** It would balloon the database and the sync pull, and Postgres has no
signed-URL story.

**Rejected: public bucket with unguessable names.** A leaked URL would stay valid forever; "no other
user can fetch it even with a guessed URL" needs the policy, not obscurity.

## ADR-026 — Gym card codes are door credentials, sealed on the server

**Status:** Accepted · 2026-11-27

**Context.** Lifters want their gym's membership card or key tag on the phone (issue #878): scan
it once, show it at the door. The code on it is a credential: whoever has the number can often
check in as its owner. It is the first secret a user hands Jim that someone else could use.

**Decision.**

- **Synced, sealed.** `gym_cards` is an ordinary own-row, last-write-wins synced table (ADR-005),
  so a new phone keeps its cards. The push route seals `code` with AES-256-GCM under a key derived
  from `GYM_CARD_KEY` (the card id bound in as associated data) before the row reaches Postgres,
  and the pull route opens it for the signed-in owner. Database backups, the Supabase table editor
  and anything else that reads the table only see `gc1.…` ciphertext. Without the key a push of a
  card fails and stays queued on the phone, rather than storing the code in the clear. A row that
  won't open is left out of the pull, so the phone keeps its own copy.
- **Plain on the phone.** In IndexedDB the code is plain, like every other row: the phone's own
  passcode and data protection guard it. Encrypting it locally would need an unlock at the
  turnstile, the wrong trade for a card shown in a queue.
- **Never shared.** No friend function, post, share, admin screen or tool, telemetry or `/v1`
  endpoint reads the table. The MCP lists cards (name, format, color, gym) and deletes them, but
  no tool reads or sets the code: an assistant has no use for a door credential. This is a
  deliberate exception to the MCP parity rule. A guard test (`gym-card-privacy.test.ts`) fails CI
  if any of that changes. The user's own exports include the code.
- **Drawn once, offline.** The scanner keeps the symbology and the exact text. bwip-js draws it
  again as SVG when the card is saved, and the SVG is stored on the phone, so the door view needs
  no encoder, network or camera. Scanning uses the browser's BarcodeDetector where it exists
  (Android) and zxing-wasm elsewhere (every iPhone, where WebKit ships it switched off), with the
  WASM binary served from this origin.

**Rejected: device-only cards.** Simplest for privacy, but a reinstall or a new phone loses them.

**Rejected: Wallet passes first.** Apple Wallet only takes QR, PDF417, Aztec and Code 128 (not the
common Code 39 key tag) and needs a paid developer account and server-side signing. Kept as a later
option.

**Not possible: NFC, RFID and magnetic stripes.** A web app can't read most fobs (Web NFC is
Android-only and NDEF-only) and no browser can emulate a card.

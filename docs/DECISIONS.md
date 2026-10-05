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

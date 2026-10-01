# Architecture — Jim

A personal strength-training PWA for iPhone 16, with an MCP server so Claude can read
training history and write future programming.

**Primary objective:** log a working set in under 3 seconds, one-handed, with no network.
Everything else is subordinate to that.

---

## 1. System shape

```
┌─ iPhone 16, installed PWA ──────────────────────┐
│  React UI (Next.js App Router, client routes)   │
│        │ reads/writes synchronously             │
│  Dexie / IndexedDB  ◄── source of truth         │
│    ├── sessions, sets, routines, exercises      │
│    ├── outbox   (pending mutations, ordered)    │
│    └── syncMeta (cursor, deviceId)              │
│        │                                        │
│  SyncEngine — foreground-driven flush/pull      │
└────────┼────────────────────────────────────────┘
         │ HTTPS, batched
┌────────▼──────────────┐       ┌──────────────────┐
│ Next.js Route Handlers│       │ MCP server       │
│  POST /api/sync/push  │       │ streamable HTTP  │
│  GET  /api/sync/pull  │       │ OAuth 2.1        │
└────────┬──────────────┘       └────────┬─────────┘
         │                               │
         └──────────► Supabase Postgres ◄─┘
                      (RLS by user_id)
```

The UI never awaits the network. Every mutation is applied to IndexedDB *and* appended to an
outbox in one transaction. React reads only from IndexedDB via Dexie live queries, so the screen
updates the instant the write lands. Sync is a separate, invisible concern.

---

## 2. Platform constraints (non-negotiable)

These were verified against current iOS behaviour and they shape the design. Violating any of
them produces silent data loss, which is the worst failure mode a workout logger can have.

| # | Constraint | Consequence |
|---|---|---|
| 1 | **Background Sync API does not exist on iOS.** Safari has never shipped it. | Sync cannot be driven by `sync` events. It is foreground-driven only. |
| 2 | **Non-installed iOS web apps have storage evicted after 7 days of non-use.** Home-screen-installed PWAs are exempt. | The app hard-gates on install. Not a dismissible banner. |
| 3 | **`navigator.vibrate` is unsupported on iOS**, and the app isn't installed as a PWA widely enough to rely on tricks that only work from a real user gesture in a standalone window. | No haptic feedback anywhere; `components/ripple-effect.tsx` gives taps a visual confirmation instead, and rest-timer completion uses audio + notification. |
| 4 | **Background timers are unreliable.** | The rest timer derives from a stored absolute timestamp, recomputed on resume. Never `setInterval` accumulation. Its completion notification is a server-scheduled Web Push (ADR-014), since the page can't run while backgrounded. |
| 5 | **Web Push requires home-screen install**, and is unavailable in the EU under the DMA. | Acceptable here; noted so it is not discovered late. |

As of iOS 26, anything added to the Home Screen opens as a web app by default, which makes the
install gate in constraint 2 less of an imposition than it once was.

---

## 3. Sync design

### Conflict strategy

Make conflicts structurally rare rather than solving them cleverly.

- **Sets are append-only and immutable.** Editing a set writes a new row that supersedes the old
  one (`supersedes_id`); deleting writes a tombstone (`deleted_at`). There are no `UPDATE`s on
  `sets`, ever. Two devices therefore cannot disagree about a set's contents — only about which
  set is current, which is a total order by `(created_at, id)`.
- **Sessions and routines use last-write-wins**, tie-broken on `(updated_at, device_id)`.
  One person, one phone, one workout at a time. LWW is correct here; a CRDT is not worth its weight.
- **Client-generated UUIDv7 primary keys.** Time-sortable, no server round-trip to obtain an ID,
  no ID reconciliation on sync.

### Protocol

**Push** — `POST /api/sync/push`, an ordered batch of outbox mutations. Each carries a client-side
`mutation_id`. The server records applied IDs in `sync_mutations`, so a replayed batch is a no-op.
On success the mutations are removed from the outbox.

**Pull** — `GET /api/sync/pull?since=<server_seq>`, returning every row changed after a monotonic
server sequence number, tombstones included. The new cursor is stored in `syncMeta`.

**Triggers** — app boot, `visibilitychange → visible`, `online`, a 60s interval while foregrounded,
and session finalize. Never `sync` events; they do not fire on iOS.

### Sync status is user-visible

A persistent indicator shows `synced` / `pending N` / `error`. Silent sync failure is the single
worst bug this system can have, so it is never silent.

---

## 4. Data model

Postgres is authoritative for schema shape; Dexie mirrors it. Every user table carries `user_id`
and an RLS policy of `user_id = auth.uid()`.

```
users              id, email, username (unique, lowercase), created_at
                   settings: units(lb|kg), default_bar_weight, available_plates[],
                             default_rest_seconds, week_start

exercises          id, owner_id (NULL = global seed), name, aliases[]
                   primary_muscles[], secondary_muscles[], equipment,
                   mechanic(compound|isolation), force(push|pull|static), level,
                   tracking_type(weight_reps|time|distance|bodyweight|weighted_bodyweight),
                   category(strength|warmup),
                   instructions[], image_urls[], is_archived
                   -- editing a seed row clones it into a user-owned row (copy-on-write)

routines           id, user_id, name, notes, position, folder,
                   kind(strength|warmup), warmup_routine_id?, warmup_minutes?
routine_exercises  id, routine_id, exercise_id, position, superset_group,
                   target_sets, target_reps_low/high, target_rest_seconds,
                   target_duration_seconds, notes

sessions           id, user_id, routine_id?, name, started_at, ended_at,
                   notes, bodyweight?, device_id, updated_at
session_exercises  id, session_id, exercise_id, position, superset_group, notes,
                   sticky_note, rest_seconds, warmup_sets

sets               id, session_exercise_id, set_index,
                   kind(warmup|working|drop|failure),
                   weight, reps, duration_seconds, distance,
                   rpe?, rir?, completed_at,
                   supersedes_id?, deleted_at?        -- append-only, never UPDATEd

personal_records   id, user_id, exercise_id, kind(1rm|volume|weight|reps_at_weight),
                   value, set_id, achieved_at         -- derived, never hand-edited

body_measurements  id, user_id, kind, value, unit, measured_at   (v1: bodyweight only)

sync_mutations     id (mutation_id), user_id, applied_at         -- idempotency ledger

friendships        id, requester_id, addressee_id, status(pending|accepted),
                   created_at, accepted_at                 -- one row per pair; server-only (ADR-017)

workout_reactions  session_id, user_id, kind(strong|fire|clap|party), created_at
                                                           -- a friend's reaction; server-only (ADR-017)
```

**Warm-ups** (`exercises.category = 'warmup'`) are ordinary exercises logged for reps or time.
They never produce `personal_records` and are left out of muscle volume — they're tracked by how
often they're done. A `warmup`-kind routine is a reusable warm-up block; a strength routine links
one via `warmup_routine_id`, and starting a session prepends its exercises, grouped (with any
warm-ups in the routine itself) under a timer at the start of the workout. Curated warm-ups are
seeded as global rows (`warmup-*` slugs); warm-up templates are code-defined in `packages/core`
and copied into the user's own routines, since routines are strictly user-owned. The Routines
tab's Explore view extends the same idea to whole routines and programs (`packages/core`'s
`explore` module, e.g. Maddy's Workout Split): adding one copies its routines, warm-ups and
weekly schedule into the user's rows. Strength exercises those templates need that
free-exercise-db lacks are seeded as global rows with `curated-*` slugs.

`personal_records` is a derived cache, recomputable from `sets` alone. If it ever disagrees with
`sets`, `sets` wins and the cache is rebuilt.

### Shared computation

Estimated 1RM (Epley, with Brzycki available), volume rollups, PR detection and plate breakdown
all live in `packages/core` as pure functions. The PWA, the API and the MCP server import the same
implementations, so a number shown on the phone and a number reported by Claude cannot drift.

---

## 5. MCP server

A separate deployable (`apps/mcp`) on streamable HTTP transport, with OAuth 2.1 via the official
TypeScript SDK's `authProvider`. It reaches Postgres through `packages/db` and is subject to the
same RLS — **it holds a user token, not a service-role key.** A service-role key here would be a
standing full-database credential sitting in a network-exposed process.

Clients that can't do OAuth (scripts, cron jobs) can instead send a personal access token as
`Authorization: Bearer jim_pat_…`, created and revoked in Settings → Connect Claude. Only a SHA-256
hash is stored (`personal_access_tokens`). The server resolves a presented token to its owner through
one SECURITY DEFINER function (migration 0027), run as `anon`, and then runs every tool as that user
under RLS, the same as an OAuth session.

**Read tools**

| Tool | Purpose |
|---|---|
| `list_workouts(from?, to?, limit?)` | Sessions with summary stats |
| `get_workout(session_id)` | Full detail, every set |
| `exercise_history(exercise, from?, to?)` | All sets for one exercise over time |
| `get_prs(exercise?, kind?)` | Personal records |
| `volume_report(group_by, from, to)` | Volume by muscle, exercise or week |
| `search_exercises(query, muscles?, equipment?)` | Catalog search |
| `dpr_status()` | Dynamic Progression: block, each focused lift's next call, e1RM vs goal, recent decisions |
| `list_routines(folder?, query?)` | Every routine, logged or not, with exercise count and last performed |
| `get_routine(routine)` | One routine's ordered exercises and targets, in the shape `update_routine` takes |

**Write tools**

| Tool | Purpose |
|---|---|
| `create_routine(name, exercises[])` | Build a program |
| `update_routine(routine_id, ...)` | Amend a program |
| `schedule_workout(routine_id, date)` | Plan a session |
| `log_past_workout(started_at, exercises[], ...)` | Record an already-finished workout, with PRs |
| `upsert_exercise(...)` / `merge_exercises(keep_id, merge_id)` | Catalog management |

Writes land in Postgres and reach the phone on the next pull.

Every write tool takes `dry_run`. A dry run executes the write inside its RLS transaction and then
rolls it back, so the preview is exactly what a committed call would write (only ids and timestamps
differ). `merge_exercises` defaults to `dry_run: true` because a merge repoints history and is hard
to undo; the others default to `false`.

**Explicitly excluded: mutating an in-progress session.** The phone owns the live session. A second
writer there would force real conflict resolution for almost no benefit. `log_past_workout` doesn't
conflict with this: it only inserts a new session that has already ended (ADR-007 amendment). Revisit once the sync
engine has proven itself in use.

---

## 6. iPhone 16 specifics

Design target **393 × 852 CSS px** (iPhone 16 base). The Pro is 402 × 874 and the Plus 430 × 932,
so layout must be fluid rather than pinned to one width.

The hands-on rules learned since (layout model, scroll locking, overlays, popups, z-index,
lifecycle) live in [`docs/PWA.md`](PWA.md).

- `viewport-fit=cover` plus `env(safe-area-inset-*)` padding; the bottom tab bar clears the home indicator.
- **Minimum 16px font on every input** — anything smaller triggers focus-zoom on iOS.
- `touch-action: manipulation` globally, killing double-tap zoom and the 300ms delay.
- `maximum-scale=1, user-scalable=no` to kill pinch-zoom — `touch-action: manipulation`
  deliberately still permits it. Honored in the standalone app; a Safari tab ignores it and
  only ever shows the install gate anyway. System zoom and Dynamic Type are unaffected.
- `overscroll-behavior: none` **on the root element** (it never propagates from `<body>`) to
  stop pull-to-refresh and rubber-banding inside the standalone shell.
- `-webkit-tap-highlight-color: transparent` on every control — the grey tap flash reads as browser.
- Long-press context menu and text selection suppressed **only when installed** (`body.pwa`, set by
  `components/pwa-chrome.tsx`), with hyperlinks, media, text entry, and `.allow-pwa-select` regions
  (errors, logged numbers) opted back in. A button styled as an `<a>` (`[data-ripple]`, e.g. the
  bottom tab bar) is not a hyperlink and stays suppressed, so long-pressing it doesn't surface
  "Open in New Tab" and break the native feel. Outside the installed app both stay untouched.
- Minimum 44 × 44pt tap targets; primary logging controls sit in the bottom third (thumb zone).
- `inputmode="decimal"` on weight, `inputmode="numeric"` on reps.
- **Screen Wake Lock API** (Safari 16.4+) held for the duration of an active session.
- Full icon set, `apple-touch-icon`, `display: standalone`, themed status bar, splash screens.
- Install gate when `display-mode` is not `standalone` (see constraint 2).

---

## 7. Repo layout

```
jim/
├── apps/
│   ├── web/                 Next.js 16 App Router PWA
│   │   ├── app/             /, /workout, /routines, /history, /exercises, /settings
│   │   ├── lib/db/          Dexie schema, live queries
│   │   ├── lib/sync/        outbox, push/pull, triggers
│   │   └── public/          manifest, icons, sw.js
│   └── mcp/                 MCP server (streamable HTTP + OAuth)
├── packages/
│   ├── core/                shared types + pure logic (1RM, volume, PRs, plate math)
│   └── db/                  Drizzle schema, migrations, RLS policies, seed script
└── docs/                    ARCHITECTURE.md, DECISIONS.md, STORIES.md
```

Tooling: pnpm workspaces, TypeScript strict, Tailwind + shadcn/ui, Vitest for `packages/core`,
Playwright for the logging flow, Biome for lint and format.

---

## 8. Verification strategy

**Unit** — Vitest over `packages/core`. The 1RM formulas, plate math and PR detection are pure
and cheap to test, and they are what the whole app's numbers rest on.

**Sync correctness** — the highest-risk area, tested explicitly:

- Log offline → reconnect → assert rows in Postgres.
- Replay an outbox batch twice → assert no duplicate sets.
- Mutate one routine on two clients → assert LWW converges.
- Kill the app mid-session → relaunch → assert the session resumes intact.

**On-device** — Safari remote-inspect from a Mac against the Vercel preview, installed to the
iPhone 16 home screen. Check safe areas, focus-zoom, wake lock and airplane-mode cold start.
Lighthouse PWA audit on the preview deployment.

**MCP** — connect Claude Code to the deployed server and exercise each tool. Confirm a second
user's token cannot read the first user's sessions, enforced by RLS rather than by application-layer
filtering.

---

## Sources

- [PWA iOS limitations and Safari support 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Progressive Web Apps on iOS 2026](https://www.mobiloud.com/blog/progressive-web-apps-ios/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP transports specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [free-exercise-db (public domain)](https://github.com/yuhonas/free-exercise-db)
- [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)

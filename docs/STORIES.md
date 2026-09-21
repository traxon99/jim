# v1 Stories — Jim

Scope: **logging core, done well.** Everything else is in the Backlog at the bottom — deferred,
not discarded.

Stories are sequenced so each one leaves the app in a working, usable state. Dependencies are
listed where they are real; where they are not, stories can be reordered freely.

| # | Story | Depends on |
|---|---|---|
| S0 | Monorepo scaffold | — |
| S1 | Schema, migrations, RLS, catalog seed | S0 |
| S2 | Auth + installable PWA shell | S0, S1 |
| S3 | Local-first store + sync engine | S1, S2 |
| S4 | Exercise catalog | S3 |
| S5 | Routines | S4 |
| S6 | **Active session logging** | S4, S5 |
| S7 | History & analytics | S6 |
| S8 | MCP server | S1, S6 |

S6 is the story the project exists for. S0–S5 are the scaffolding it stands on, and S3 is where
the risk lives.

---

## S0 — Monorepo scaffold

Stand up the workspace so every later story has a place to land.

- pnpm workspace: `apps/web`, `apps/mcp`, `packages/core`, `packages/db`
- TypeScript strict across all packages
- Biome for lint and format; Vitest configured for `packages/core`
- Next.js 16 App Router app booting with the App Router layout in place
- Vercel project linked, preview deployments on push

**Acceptance criteria**
- [ ] `pnpm dev` serves a page at localhost
- [ ] `pnpm test` runs and passes (even with zero tests)
- [ ] `pnpm lint` and `pnpm typecheck` pass clean
- [ ] A push produces a working Vercel preview URL
- [ ] `packages/core` is importable from both `apps/web` and `apps/mcp`

---

## S1 — Schema, migrations, RLS, catalog seed

Every table from `ARCHITECTURE.md` §4, with tenancy enforced from the first migration.

- Drizzle schema for all tables; `user_id` on every user-owned table
- RLS policies (`user_id = auth.uid()`) on every user table — **not** application-layer filtering
- `sets` constrained against `UPDATE` at the database level, enforcing ADR-003 rather than trusting callers
- Seed script pulling free-exercise-db, normalising muscle names to a controlled vocabulary and assigning `tracking_type` per exercise
- Seeded rows are global (`owner_id IS NULL`); the script is idempotent and rerunnable

**Acceptance criteria**
- [ ] A fresh database migrates and seeds roughly 800 exercises
- [ ] Rerunning the seed produces no duplicates and clobbers no user-owned rows
- [ ] Authenticated as user A, a query for user B's sessions returns zero rows — verified against RLS, with no application-layer filter present
- [ ] An `UPDATE` against `sets` is rejected by the database
- [ ] Every exercise has a non-null `tracking_type` and at least one primary muscle

---

## S2 — Auth + installable PWA shell

The app becomes something you can put on a phone.

- Supabase email/password auth; session persisted across cold starts
- Web app manifest, full icon set, `apple-touch-icon`, splash screens
- Service worker precaching the app shell
- Safe-area layout (`viewport-fit=cover`, `env(safe-area-inset-*)`), bottom tab bar clearing the home indicator
- Install gate when `display-mode` is not `standalone` (ADR-010)
- Global iOS hygiene: 16px minimum input font, `touch-action: manipulation`, `overscroll-behavior: none`

**Acceptance criteria**
- [ ] Installs to the iPhone 16 home screen from Safari and launches standalone with no browser chrome
- [ ] The shell loads cold in airplane mode
- [ ] Email/password sign-in completes and survives an app restart
- [ ] No content is obscured by the Dynamic Island or the home indicator
- [ ] Focusing a weight input does not zoom the viewport
- [ ] Opened in a browser tab rather than installed, the install gate appears

---

## S3 — Local-first store + sync engine

The riskiest story. Budget accordingly, and treat its tests as part of the deliverable.

- Dexie schema mirroring Postgres, plus `outbox` and `syncMeta` tables
- Mutations write entity and outbox entry in one transaction — never one without the other
- `POST /api/sync/push` with a `sync_mutations` idempotency ledger
- `GET /api/sync/pull?since=<server_seq>` returning changed rows and tombstones
- Foreground-driven triggers only: boot, `visibilitychange → visible`, `online`, 60s interval, session finalize (ADR-002)
- Supersede-chain and tombstone resolution as shared helpers in `packages/core`
- Persistent sync status indicator: `synced` / `pending N` / `error`, with a manual retry

**Acceptance criteria**
- [ ] A workout logged fully in airplane mode appears in Postgres after reconnecting
- [ ] Replaying an identical outbox batch twice produces no duplicate rows
- [ ] The same routine edited on two clients converges to the later `updated_at`
- [ ] Force-quitting mid-session and relaunching resumes the session with every set intact
- [ ] A failed push leaves mutations in the outbox and surfaces `error` in the indicator
- [ ] The indicator shows a non-zero pending count while offline, reaching `synced` after reconnect
- [ ] No sync path depends on a `sync` event

---

## S4 — Exercise catalog

- Search across name and aliases, fuzzy, ranked
- Filter by muscle group and equipment
- Detail view: instructions, images, muscles worked, your history with the movement
- Create and edit custom exercises
- Editing a global seed row clones it copy-on-write into a user-owned row (ADR-008)
- Archive rather than delete, so historical sets keep their referent

**Acceptance criteria**
- [ ] Searching "bench" ranks barbell bench press first
- [ ] An alias search ("OHP") finds the overhead press
- [ ] A custom exercise survives a full sync round-trip
- [ ] Editing a seed exercise leaves the global row untouched and creates a user-owned clone
- [ ] Archiving an exercise used in past sessions leaves that history intact and readable
- [ ] Search returns results with no network

---

## S5 — Routines

- Create, edit, duplicate and delete routines
- Add, remove and reorder exercises via drag
- Per-exercise targets: sets, rep range, rest seconds, notes
- Folders for grouping programs
- Fully functional offline

**Acceptance criteria**
- [ ] A routine can be built end to end in airplane mode and syncs on reconnect
- [ ] Reordering persists across an app restart
- [ ] Duplicating a routine copies its exercises and targets without aliasing the original
- [ ] Deleting a routine leaves sessions previously started from it intact

---

## S6 — Active session logging

**The story that matters.** Everything before it is scaffolding; everything after builds on it.

- Start a session empty or from a routine
- Per-exercise set rows: weight and reps, keyboard-optimised (`inputmode`, no zoom)
- **Previous-session values shown inline** on each row as the number to beat
- One-tap "repeat previous set"
- Set kinds: warmup, working, drop, failure
- Rest timer auto-starting on set completion — timestamp-derived (ADR/constraint 4), audio alert via an `AudioContext` primed on first gesture, no reliance on `navigator.vibrate`
- Plate-math breakdown from the user's configured bar and available plates
- Live PR detection with inline celebration
- Session and per-exercise notes
- Screen Wake Lock held for the session's duration
- Finalize: summary of volume, duration and PRs

**Acceptance criteria**
- [ ] A full 5×5 is logged one-handed, offline, in under 90 seconds
- [ ] Every primary control sits within thumb reach in the bottom third at 393 × 852
- [ ] The screen does not sleep at any point during an active session
- [ ] Backgrounding the app for 3 minutes mid-rest and returning shows the correct remaining time
- [ ] Previous-session weight and reps appear on every set row where history exists
- [ ] A new PR is detected and surfaced within the session, not after it
- [ ] Plate math for 225 lb on a 45 lb bar reads 2×45, 2×25, 2×10 per side
- [ ] Editing a completed set writes a superseding row, leaving the original in the database
- [ ] Force-quitting mid-set loses at most the set currently being typed

---

## S7 — History & analytics

- Session list with summary stats, grouped by week
- Session detail: every exercise, every set, PRs achieved
- Per-exercise history with an estimated-1RM-over-time chart
- PR list across all movements
- Weekly volume by muscle group
- Calendar heatmap of training frequency

**Acceptance criteria**
- [ ] Every view and chart renders from IndexedDB with no network
- [ ] The estimated-1RM chart matches `packages/core` computed by hand for a known set of data
- [ ] Volume-by-muscle attributes secondary muscles at a documented, consistent weighting
- [ ] Charts are legible at 393px wide and readable in both light and dark mode
- [ ] Empty states are handled for a user with no history

---

## S8 — MCP server

- Streamable HTTP transport, OAuth 2.1 via the SDK's `authProvider`
- User-scoped token under RLS — **no service-role key** (ADR-006)
- Read tools: `list_workouts`, `get_workout`, `exercise_history`, `get_prs`, `volume_report`, `search_exercises`
- Write tools: `create_routine`, `update_routine`, `schedule_workout`, `upsert_exercise`, `merge_exercises`
- All computation via `packages/core`, so MCP numbers and phone numbers cannot drift
- Deployed and reachable

**Acceptance criteria**
- [ ] Claude Code connects to the deployed server and lists every tool
- [ ] It correctly answers "how has my bench press estimated 1RM moved over the last 8 weeks?"
- [ ] A routine created via `create_routine` appears on the phone after the next pull
- [ ] A second user's token reading the first user's sessions returns nothing, blocked by RLS
- [ ] Estimated 1RM reported over MCP matches the phone's figure exactly for the same lift
- [ ] No tool can mutate an in-progress session (ADR-007)
- [ ] `merge_exercises` repoints historical sets without orphaning any

---

## Backlog

Deferred from v1. Roughly grouped by what would most improve the app once the core is in daily use.

**Logging depth** — supersets as a first-class UI · RPE/RIR capture · automatic warmup-set
generation · 1RM test tracking · exercise notes and form cues

**Data** — Strong CSV import · full data export · Apple Health XML importer (ADR-009) ·
body measurements beyond bodyweight

**Programming** — program templates (5/3/1, GZCLP) · progression rules that auto-advance loads ·
deload detection

**Platform** — Web Push for rest-timer alerts while backgrounded · multi-device live session
handoff (ADR-007) · friend sharing and routine exchange, for which the RLS groundwork already
exists (ADR-005)

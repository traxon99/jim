# Competitive Analysis — Jim

_Researched 2026-09-27. Competitor details come from vendor pages and third-party reviews
(sources at the bottom) and can change quickly. Check them again before relying on a
specific price or feature._

## TL;DR

Jim doesn't compete with Hevy or Strong on reach. It has no App Store listing, no Apple Watch
app, no social feed and no program library. Its advantage is in three areas that no single
competitor covers together:

1. **Logging that never fails offline.** It's local-first, with append-only sets and an
   outbox sync (ADR-001/003).
2. **Automatic progression driven by RPE (DPR)** in a plain logger, which is usually a
   $30+/mo feature (JuggernautAI, RP).
3. **An MCP server that treats the agent as a first-class programmer.** It uses OAuth,
   enforces RLS and uses the same core math as the phone.

The MCP moat is **narrower than it looks**. Hevy now ships a first-party ChatGPT integration,
community Hevy MCP servers exist, and a small group of "MCP-native" trackers (GymLogic, AIm,
Workout Memory) appeared in 2026. GymLogic's architecture is almost the same as Jim's:
offline-first PWA, Supabase + RLS, and MCP that can write programs.

---

## The competitive set

| App | Category | Price (2026) | One-line positioning |
|---|---|---|---|
| **Strong** | Logger | Free / $4.99 mo · $29.99 yr · $99.99 lifetime | Fast, minimal logger; strong Apple Watch app |
| **Hevy** | Social logger | Free / $2.99 mo · $23.99 yr · $74.99 lifetime | Best free tier, social feed, Hevy Trainer, ChatGPT app, Hevy Coach |
| **Boostcamp** | Logger + programs | Free core, paid tier | 11k+ free programs, program builder, RPE/RIR, supersets |
| **Liftosaur** | Programmable logger | Free / paid | "Tracker for coders": Liftoscript DSL for any progression, PWA + native wrappers |
| **JuggernautAI** | AI powerlifting coach | $34.99 mo · $349.99 yr | RPE and e1RM-driven periodization for the SBD lifts |
| **RP Hypertrophy** | Hypertrophy coach | Subscription | Mesocycles, per-muscle volume ramps, auto deloads |
| **Fitbod** | AI workout generator | Subscription | Generates each day's workout from recovery and equipment; no periodization |
| **GymLogic** (open source) | MCP-native PWA | Free / MIT | Offline PWA, Supabase + RLS, 6 MCP tools incl. `create_program` |
| **AIm** | Chat-first logger | Free | You log by talking to Claude/ChatGPT; 20 MCP tools; PWA viewer |
| **Workout Memory** | Chat-first memory | — | MCP "permanent memory" for training in any AI client |

---

## Where Jim is ahead

| Jim feature | Who else has it | Why it matters |
|---|---|---|
| **Local-first sync engine**: IndexedDB is the source of truth, with a transactional outbox, idempotent push and a visible `synced / pending N / error` indicator | Native apps (Strong, Hevy) work offline. Among web and MCP competitors, GymLogic has a simpler localStorage queue, AIm doesn't mention offline, and Liftosaur is offline. | "I can't log this set right now" is the failure lifters hate most, and Jim treats it as a hard constraint. |
| **Append-only, immutable sets** (edits supersede, deletes tombstone) | Nobody advertises this | You get a full audit trail, conflicts are impossible by design, and DPR decisions can always be replayed from history. |
| **DPR, Dynamic Progression**: RPE-aware, with conservative/moderate/aggressive presets, equipment-aware increments, deloads after misses, e1RM goals, blocks, a block-end recap and a deload week | JuggernautAI and RP (both expensive coach apps). Hevy Trainer (Pro) auto-progresses on the sets you did. Liftosaur does it if you write the script yourself. | You get coach-grade autoregulation inside a plain logger with no subscription. Suggestions are placeholders you can type over and are never written to your data. |
| **MCP with OAuth 2.1 + RLS** (no service-role key), and numbers come from the same `@jim/core` code the phone uses | Hevy ChatGPT app (first-party), community Hevy MCP, GymLogic (OAuth + PATs), AIm | The agent's e1RM matches the phone's exactly. An MCP bug can only ever reach one user's own data. |
| **A broad MCP write surface**: `create_routine`, `update_routine`, `schedule_workout`, `upsert_exercise`, **`merge_exercises`**, `dpr_status` | GymLogic can only write `create_program`. Hevy's integration saves routines. | `merge_exercises` (catalog cleanup that repoints history) and `dpr_status` are unusual. |
| **MCP deliberately can't touch a live session** (ADR-007) | AIm and Workout Memory go the other way: chat *is* the logger | This keeps data from getting corrupted mid-workout. (It's also a gap, see below.) |
| **Rest timer via a scheduled server push** that arrives when the app is backgrounded, plus timestamp-derived remaining time | Native apps do this with local notifications. It's rare for a PWA. | On iOS, a PWA can't do this any other way. It was a real engineering win (ADR-014). |
| **Strength-standard badges on PRs**, age-adjusted | Some apps show strength levels (e.g. Symmetric-style tools); logger PR screens usually don't | Puts PRs in context: "you just hit Intermediate". |
| **A desktop analysis portal** that reads Postgres directly | Hevy and Strong have limited web views. Liftosaur has a web editor. | Serious analysis happens on a big screen. |
| **Programs with an up-next suggestion** (sequence or weekly) and warm-up routines paired to a program | Boostcamp and Liftosaur (programs), Strong (a warm-up *calculator* in PRO) | You open the app, tap Start, and train. |
| **Pace tracker, Focus view, wake lock, plate math, previous-set values inline, one-tap prefill** | Plate math and previous values are table stakes (often paywalled in Strong PRO). A pace tracker is rare. | Everything is free, with no Pro tier. |
| **Copy-on-write seeded catalog** (~800 exercises) | Others ship bigger or curated catalogs | Your edits never get overwritten when the catalog is reseeded. |

---

## Where competitors are ahead (Jim's gaps)

Ordered by likely user impact.

| Gap | Who has it | Jim status | Notes |
|---|---|---|---|
| **Apple Watch app / HealthKit** | Strong (best in class), Hevy | Impossible as a PWA (ADR-009) | This is structural. The only honest paths are a native wrapper (Liftosaur's approach) or the Health XML importer in the backlog. |
| **Program library / templates** (5/3/1, GZCLP, PPL…) | Boostcamp (11k+), Liftosaur (50+), Hevy Trainer | 1 curated template (Maddy's split); templates are in the backlog | The biggest content gap for new users. The MCP server partly covers it, since Claude can write programs, but only for users who have Claude. |
| **Data import/export** (Strong CSV, full export) | Strong exports CSV; Hevy and AIm import from other apps; AIm even imports **photos of notebooks** | Backlog | Switching cost is the #1 adoption barrier. A Strong CSV import is the obvious first step. |
| **First-class supersets / drop sets** | Boostcamp (free), Hevy (Pro), Strong | `supersetGroup` exists in the schema, but there's no UI; drop sets were removed (#162) | Hypertrophy lifters expect these. |
| **Social / sharing** | Hevy (feed, leaderboards, routine sharing), Boostcamp | You can share a finished workout (#239). RLS already supports friends (ADR-005). | Not core to Jim's purpose, but routine exchange is cheap given the RLS work. |
| **Body measurements / bodyweight trend** | Strong PRO, Hevy | Bodyweight only; measurements are in the backlog | |
| **Per-muscle volume periodization** (mesocycles that ramp weekly sets per muscle) | RP Hypertrophy | Jim reports volume by muscle but doesn't program it | DPR adjusts load, not volume. A "volume landmarks" mode would be a natural next step for DPR. |
| **User-scriptable progression** | Liftosaur (Liftoscript) | DPR offers 3 presets | Arguably, MCP + Claude is Jim's version of this: an agent can rewrite routines. |
| **Natural-language logging via chat** | AIm, Workout Memory, Hevy's ChatGPT app (read-only history) | Deliberately excluded for live sessions (ADR-007) | Worth considering a narrow version: log a *finished* session after the fact over MCP, e.g. "I forgot my phone, here's what I did". That avoids any live-session conflict. |
| **In-app AI program generation** | Fitbod, Hevy Trainer, GymLogic (Gemini) | Only via an external MCP client | Users without Claude or another MCP client get no AI programming. |
| **Exercise demo videos / body map** | GymLogic (YouTube and body map), Hevy, Fitbod | Images from free-exercise-db | |
| **Android** | Everyone except Jim | Targets iPhone 16 | The PWA would probably mostly work, but isn't tested. |
| **Coach / client platform** | Hevy Coach ($25+/mo), Boostcamp | None | Out of scope for a personal app, though the RLS model could support it later. |
| **Achievements / streaks / gamification** | GymLogic badges, Hevy streaks | PR celebration + strength badges only | |
| **Personal access tokens for MCP** | GymLogic (`glp_…` PATs, hashed, with expiry) | OAuth only | PATs make headless or scripted clients easier. |
| **Dry-run previews for agent writes** | GymLogic's `create_program` defaults to `dry_run: true` | Writes commit immediately | A cheap safety feature that's easy to copy. |

---

## Positioning

**The honest position:** Jim is *the offline-proof, self-progressing lifting log that your AI agent can program*.

- Against **Strong/Hevy**, don't compete on breadth. Compete on DPR (free autoregulation) and
  the agent workflow.
- Against **JuggernautAI/RP**, Jim gives similar autoregulation for load at $0, but without
  their volume periodization or content.
- Against **GymLogic/AIm**, the other MCP-native tools, Jim's edge is correctness and depth:
  a real sync engine, immutable history, matching numbers, more MCP write tools and DPR.
  AIm's edge is zero-friction chat logging and import from photos.

## Suggested next moves (highest leverage first)

1. **Strong / Hevy CSV import.** It removes the switching barrier and is already in the backlog.
2. **Supersets UI.** The schema field is already there, and every competitor has them.
3. **Program templates** (5/3/1, GZCLP, PPL) in Explore, wired to DPR. Consider letting the MCP
   server publish agent-written programs as templates.
4. **`log_past_workout` over MCP** for *finished* sessions only. It gets AIm-style convenience
   without breaking ADR-007.
5. **`dry_run` on MCP writes** (`create_routine`, `merge_exercises`), copying GymLogic.
6. **Full data export** (CSV/JSON). It's a trust signal and costs little.
7. Longer term: a **native wrapper** (Capacitor, as Liftosaur does) is the only way to get a
   Watch app and HealthKit if those ever matter.

---

## Sources

- [Boostcamp vs Strong (2026)](https://www.boostcamp.app/vs/strong)
- [Hevy vs Strong (2026) — Setgraph](https://setgraph.app/ai-blog/hevy-vs-strong-app-comparison-2026)
- [Hevy Review 2026 — sensai.fit](https://www.sensai.fit/blog/hevy-review-2026)
- [Hevy for ChatGPT](https://www.hevyapp.com/features/hevy-chatgpt/)
- [Hevy MCP (community)](https://hevy-mcp.dev/)
- [Strong App Review 2026 — RepReturn](https://repreturn.com/strong-app-review/)
- [Best strength training apps on Apple Watch 2026](https://www.findyouredge.app/news/best-strength-training-apps-apple-watch-2026)
- [JuggernautAI Review 2026 — Garage Gym Reviews](https://www.garagegymreviews.com/juggernautai-review)
- [Best AI powerlifting apps 2026](https://aitoolsbakery.com/blog/best-ai-powerlifting-apps/)
- [RP Hypertrophy alternatives](https://mesostrength.com/blog/rp-hypertrophy-alternatives)
- [Liftosaur](https://www.liftosaur.com/) · [Liftoscript docs](https://www.liftosaur.com/doc/liftoscript)
- [GymLogic / PierreTsia/workout-app](https://github.com/PierreTsia/workout-app)
- [AIm — persistmcp/aim](https://github.com/persistmcp/aim)
- [Workout Memory](https://workoutmcp.com/)

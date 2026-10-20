# Shipping lessons

**Read this before you ship any change: every PR, every auto-ship run, human or agent.** It's the
short list of mistakes that have already reached the user's phone, and the rule that would have
stopped each one. Go through the checklist below against your diff before you open the PR, and add
an entry to the ledger in the same PR whenever you fix a bug.

Deeper background lives in `docs/PWA.md` (layout, scrolling, overlays, iOS), `docs/ARCHITECTURE.md`
and `docs/DECISIONS.md` (local-first data, sync). This file doesn't replace them. It points at the
rules that keep getting broken.

---

## Pre-ship checklist

Answer each one that your diff touches. If you can't verify one from here, say so in the PR body.

**Overlays, popups and cards**
- [ ] Does anything open over the page from inside a list row, card or other in-flow component? It
      must render through `FloatingCard` (portaled to `<body>`) or its own `createPortal`. A `fixed`
      div rendered in place can be painted over by the rows after it (#387).
- [ ] Is a new `absolute`/`fixed` element a `<button>`? The global ripple rule makes every enabled
      button `position: relative`, which beats plain Tailwind `absolute`. Use `absolute!` (#356).
- [ ] Does closing wait on `animationend`/`transitionend`? iOS drops it when an animation is
      interrupted. Add a timeout backstop (#356).
- [ ] Did you check the z-index scale in `docs/PWA.md` §4, and open the overlay during an active
      workout with the rest timer running (#227)?

**Layout at 393 px**
- [ ] No `max-w-*` cap or extra gutters on a page body. Use `PAGE_BODY` (full width, `px-4`) so
      the page matches every other tab (#299).
- [ ] Rows that can grow have `min-w-0` and either truncate, wrap or scroll. Check at 393 px with
      real-length text (#327, #182).
- [ ] Adding a badge or icon to a table cell? Pin it (`absolute` in a `relative` cell) instead of
      setting it inline, or it widens the column and pushes the row past the card (#440).
- [ ] Building or changing a form? Load it at 393 px with every optional section showing and the
      longest realistic values, then try to scroll sideways. Native elements carry their own
      minimum widths: `<fieldset>` defaults to `min-width: min-content` (reset globally in
      `globals.css`, so never give one `min-w-min`/`min-w-fit`), and `<input>`/`<select>` keep an
      intrinsic width unless they and every flex/grid ancestor have `min-w-0` (#458).
- [ ] Use `PageHeader` for a tab's header instead of building a one-off one (#309).
- [ ] Adding a rule to `globals.css` that targets elements (`*`, `button`, `input`…)? Put it in
      `@layer base`. Unlayered CSS beats every Tailwind utility, which is how one rule switched off
      every `touch-none` (#663).
- [ ] Blur, filters and glass: iOS Safari doesn't clip a CSS-`filter`ed layer to its parent's
      rounded corners. Use gradients inside the shape instead (#374, #376).

**Taps and destructive actions**
- [ ] Can a fast double tap run a save twice? Guard it until the result has rendered, not just until
      the promise resolves (`useLogGuard`, #491).
- [ ] Can a second tap land on something destructive? Never swap a delete/cancel control into the
      spot the user just tapped to confirm. A double tap on ✓ deleted the set it had just logged
      (#318).
- [ ] Does a new delete take effect in one tap? List rows get the shared `UndoBar` /
      `useUndoable`; removals that lose configuration ask with `confirm()` first (#520).
- [ ] Does an edit form copy a `useLiveQuery` row into state? Seed it once, so a sync landing
      mid-edit can't replace what's being typed (#518).
- [ ] Does a disabled or "busy" state reset on every exit path, including cancel and switching
      tabs? Hidden tabs stay mounted and their effects keep running (#110, `docs/PWA.md` §8).

**Workout and set logic**
- [ ] Matching this session's sets against last time's? Match by set kind **and** position, never by
      raw index. Warm-ups shifted Prev values and turned into extra working sets (#381).
- [ ] Showing a stored weight, reps or RPE? Format it (`formatSetValue`): synced values are
      Postgres numeric strings like "100.00" and "10.0", wider than phone-logged ones (#646).
- [ ] Showing or pre-filling a computed weight? Round it to what the user's bar and plates can load
      (`nearestLoadableWeight`), never raw math like 51.08 (#320).
- [ ] Counting training volume (sets, weight × reps, per muscle)? Count working sets only: leave
      out warm-up sets (`kind === "warmup"`) as well as warm-up exercises (#395).
- [ ] Creating or editing an exercise (app form or MCP)? A strength exercise must keep at least one
      primary muscle (`muscleTagsError`), and a muscle is primary or secondary, never both
      (`withoutPrimary`). An untagged lift counts toward no muscle's volume (#643).
- [ ] Sets are append-only and sync is foreground-driven (`docs/DECISIONS.md`). Don't edit rows in
      place.

**Routing and the install gate**
- [ ] Redirecting to a `?next=` (or any URL from the request)? Pass it through `safeNextPath` so it
      can only be a path on this origin (#486).
- [ ] Reading the URL during render? Use `usePathname`/`useSearchParams`, not `window.location`,
      which still holds the previous page during a client-side navigation (#444).
- [ ] Adding a page a desktop browser must reach (portal, auth)? Check it against
      `isInstallGateExempt` in a non-installed desktop browser (#444).
- [ ] Does a route call an outside service (GitHub, push, email)? Give it a per-user limit kept in
      Postgres, send no email or other personal data, and keep env var names out of error responses
      (#504).

**Release**
- [ ] `LATEST_RELEASE_NOTE` in `apps/web/lib/pwa/notifications.ts` describes *this* change. Every
      merge re-sends it, so a stale note goes out again (#115).
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass locally. jsdom tests can't catch layout
      bugs, so for UI changes also follow `docs/PWA.md` §10.

---

## Ledger of recent breaks

Newest first. One line on what broke, the cause, and the rule. Add yours at the top.

| Issue / PR | What broke | Cause | Rule |
|---|---|---|---|
| #666 | Scrolling down History then tapping Workout opened Workout partway down, and coming back lost History's place | All tabs and pages scroll in the shell's one scroller, and tab pages render `null`, so nothing reset or restored it | `ShellScroller` remembers a position per page (`scrollKey`) and restores it before paint; tapping the active tab scrolls to top |
| #669 | Set to Dark on a light-mode phone (or the reverse), Jim opened white then flipped to black, and date pickers and selects stayed light in dark mode | The setting lived only in Dexie, applied after first paint; the splash followed `prefers-color-scheme`; no CSS `color-scheme` | Theme-dependent first-paint styles key off `.dark`, which `COLOR_SCHEME_SCRIPT` applies from localStorage before paint; `:root` sets `color-scheme` to match |
| #672 | Most iPhones (Pro Max, Air, 13/14, Plus, mini, SE) opened on a blank white screen, which flashed white in dark mode | Launch images existed only for the three iPhone 16 sizes | One `SPLASH_DEVICES` entry per screen size still in use; the splash routes are generated from it |
| #677 | Focus view's Next opened the next exercise partway down, past its first sets | Prev/Next swapped the content inside the same scroller without resetting it | A view that swaps its content in place resets its scroller when the item changes |
| #683 | With 12+ exercises Focus view's step strip shrank each step under 30 px | The steps were `flex-1` with no minimum | Tap targets keep `min-w-11`; a strip that can't fit them scrolls sideways |
| #667 | Tapping "Still working out?" or "Workout ended" opened Jim wherever it was left, not on the workout | `notificationclick` focused any existing window and ignored the notification's URL; a suspended PWA always counts as existing | A notification with a page posts `jim-navigate` to the focused app, which routes there client-side |
| #671 | With notifications off, Jim kept running an old build for days | The worker only checked for updates on page load or a release push, and a suspended PWA isn't reloaded | Check for updates when the app returns to the foreground (throttled), and let `reloadOnUpdateWhenAway` apply them |
| #665 | No signal showed a red "Sync error · N pending", and a set logged offline didn't show up in the count until the next cycle | A fetch that never got an answer was reported the same as a server rejection, and the indicator only read the count saved at the end of a cycle | Unreachable (thrown fetch, timeout) is `offline`, shown neutral with the live outbox count; red is for 5xx and rejected rows. Every sync request has a timeout (#684) |
| #661 | Opening Jim with no signal showed Safari's "not connected" page for a signed-in user, even after #506 | `/` always redirects to `/workout`, and the worker only stored `/` when it wasn't redirected, so it never stored a page | Cache the page a navigation actually lands on (keyed by the final URL, as a fresh non-redirected copy), fall back to `/workout`, and check an offline cold start (PWA.md §10) |
| #663 | Every `touch-none` in the app did nothing, so overlay bars could scroll the page and drag handles could pan the list on iPhone | `* { touch-action: manipulation }` sat outside a CSS layer in `globals.css`, and unlayered CSS beats Tailwind's utilities layer | Element-wide rules in `globals.css` go in `@layer base` so a utility can override them (guarded in `layout-guards.test.ts`) |
| #664 | A render error left the installed app on Next's bare "Application error" screen, with no way out but force-quitting | There was no `error.tsx` or `global-error.tsx` | Keep `app/error.tsx` and `app/global-error.tsx` (shared `ErrorScreen`): Reload, Go to Workout, Send feedback |
| #653 | Home showed only your initial, never the profile picture set in Settings | `HomeSummary` drew its own initial circle and `/api/friends` never returned the user's own avatar | A picture shown for the signed-in user comes from the shared `useFriends` store; saving one refreshes it so mounted tabs update |
| #654 | Profile's "Edit profile and sharing" link opened the general Settings menu instead of the picture and share-link screens | #650 split Settings into sub screens, but the link kept pointing at `/profile/settings` | When a feature moves, grep for links to its old home and point them at the new screen (same as #543) |
| #646 | Synced sets read "100.00" and "10.0" in the active workout, and those rows pushed the ✓ off the card | The set row printed the server's numeric strings as-is, so they were wider than values logged on the phone | Display stored set values through `formatSetValue`; a long value drops a text size rather than widening its column |
| #643 | A custom Bench Press and Squat counted toward no muscle, so weekly chest, shoulder and leg volume read low | The exercise form saved a strength exercise with no muscles and had no secondary picker, so users either left lifts untagged or tagged every helper as primary; `upsert_exercise` also allowed empty muscles | Strength exercises need a primary muscle in the form and the MCP (`muscleTagsError`); helpers go in the secondary picker, deduped with `withoutPrimary` |
| #511 | Claude's weekly summary put a Sunday-evening workout in Los Angeles into the next week | Week grouping used the runtime's local date, and the MCP server runs in UTC | Server-side calendar math takes the user's stored IANA time zone (`users.time_zone`, reported by the phone); never the server's |
| #520 | Cardio and warm-up sets, weigh-ins and measurements deleted in one tap with no Undo; removing a routine exercise, a program day or a gym, and skipping a PRP deload, didn't ask | Each screen chose its own delete behavior; the strength section's Undo (#318) was never shared | List rows delete with the shared `UndoBar`/`useUndoable` (components/undo-bar.tsx); removals that lose configuration ask with `confirm()` first |
| #528 | Home had two Profile links and shortcuts to Train and Routines that the tab bar already shows | Entry points were added on Home without checking what the header and tab bar already reach | Before adding a link, check the header and tab bar; a shortcut goes only where they don't |
| #552 | A routine with a long note made a tall row in its folder, while search showed the same routine differently | The routine row was written three times and the folder copy lost its truncation | One shared row component per list item; secondary text is `line-clamp`ed |
| #514 | MCP errors returned raw SQL and params, and `schedule_workout`/`log_past_workout` rejected routine names | `server.ts` echoed `error.message` for database errors, and two tools looked routines up by id instead of `findRoutine` | Database errors reach the caller as a generic message (original logged); resolve routines with `findRoutine` so a name works anywhere an id does |
| #547 | Workout detail and shared-link preview had a bare back button instead of the sticky header, and the preview always went back to Routines even from Settings | Both screens built one-off headers, and the preview hard-coded `/routines` | Every pushed screen uses `PageHeader` + `PAGE_BODY`; pass the real return path (`?from=`) instead of hard-coding one |
| #549 | A swiped-away set row could run its delete (and state updates) after the row had unmounted | The swipe hook's settle `setTimeout` was never cleared on unmount | Keep timers in a ref and clear them in an effect cleanup |
| #540 | MCP rejected `-04:00` offsets on some date inputs, and scheduling "2026-10-20T00:00:00Z" showed as the previous evening for US users | Four tools used `datetime()` without `offset: true`, and `schedule_workout` stored an instant for what is a calendar day | One date-time schema across MCP tools (`{ offset: true }`); a calendar day is stored as noon UTC, not midnight |
| #532 | Boot, visibility, `online`, the 60 s timer and finalize could each start a sync cycle while another ran, double-POSTing batches and saving the pull cursor out of order | `runSyncCycle` had no in-progress guard | Anything several triggers can start gets a single-flight guard: callers during a run share one follow-up run |
| #529 | The History calendar showed trained and selected days by color only, so screen readers heard just a number | Day buttons had no `aria-label` or `aria-pressed`, and `title` isn't read on iOS | State shown by color or a ring also needs text: `aria-label` with the facts, and `aria-pressed` on toggles |
| #505 | The production seed pulled `main` of a third-party dataset and cast its mechanic/force/level straight into db enums | A new upstream commit or odd value could change the catalog or fail the insert mid-deploy | Pin third-party data to a commit SHA and validate enum values before inserting (null if unknown) |
| #535 | Another site could make a signed-in user's browser POST to our cookie-auth API routes | Nothing checked the `Origin` header on mutating `/api/*` requests | The proxy rejects a mutating `/api/*` request whose `Origin` isn't our own; server-to-server routes are exempted explicitly |
| #545 | A screen reader said "Log set 3" for the row shown as 1 (after two warm-ups); the Exercises muscle and equipment selects had no label | Button labels used the raw row index, and the selects had no `aria-label` or `min-w-0` | Label a row's controls with the number the row shows; every `<select>` gets an `aria-label` and `min-w-0` in a flex row |
| #546 | Link-buttons on History, Profile and Settings gave no tap feedback, and a long press opened iOS's "Open in New Tab" menu | The `<Link>`s styled as buttons lacked `data-ripple` | An `<a>`/`<Link>` used as a button carries `data-ripple` (`docs/PWA.md` §7) |
| #534 | A QStash-signed rest-timer message could be replayed against any other endpoint that shares the signing key | The fire route verified only the body, not the URL the signature was issued for | Verify third-party webhook signatures against the URL too (`url:`), built by the same helper that publishes it |
| #512 | MCP `log_past_workout` accepted RPE 1–4, which the app can't show or edit | The tool's schema hard-coded 1–10 instead of the app's 5–10 scale | Bounds for a value the app already limits come from the shared constants (`RPE_MIN`/`RPE_MAX`), never literals |
| #539 | `cancel_scheduled_workout` and `delete_body_measurement` deleted on the first MCP call with no preview | They kept the write-tool default `dry_run: false` while every other delete previews | Any MCP tool that deletes or cancels takes `dryRunParam(true)`; the dry-run defaults test lists them |
| #543 | Offline, Settings left the username field on "Loading…" forever, Profile and Shared links went blank, and Friends' "Change" went to the wrong page | The fetches ignored `!result.ok`, and the link still pointed at `/profile` after editing moved to Settings | A failed load shows the error with a Try again button (like `FriendsScreen`); when a feature moves, grep for links to its old home |
| #530 | Setup "Try again" after a failed save added the same gym twice | `addGym` succeeded but `setDefaultGym` threw, and the retry ran `addGym` again | A retry must resume after the step that already committed: remember the created row and repeat only the failed step |
| #522 | The filter-count badge on Exercises was clipped | The badge was a child of the filter `<button>`, and the global ripple rule gives every button `overflow: hidden` | Never hang a badge off a button that sticks out of it; put it on a `relative` wrapper beside the button |
| #526 | Bodyweight log form could run past the right edge at 393 px | The Weight/Date label columns lacked the `min-w-0` that #458 added elsewhere, so the date input kept its intrinsic width | Flex children holding an `<input>` need `min-w-0`; sweep sibling forms when fixing one |
| #550 | A double tap on Add in the exercise picker added the exercises twice | `onPick` ran once per tap, and the add/superset code was copied into the workout and the routine editor, so a guard would have had to land twice | The picker accepts one pick per opening; the workout and routine editor share `lib/supersets/item-mutations.ts` |
| #537 | After Claude logged an older, heavier workout, a later lighter set kept its PR | `log_past_workout` compared new sets only with earlier history and never re-checked PR rows after them | Writing history into the past re-checks the PR rows after it and retires the ones that no longer hold |
| #548 | Two identical machines at different gyms looked the same in the exercise picker, and some screens dropped the machine name | The picker copied the Exercises list's row line without the gym, and a few screens used `exercise.name` | Show an exercise with `exerciseDisplayName` and its list line with `exerciseMetaLine`; don't re-implement either |
| #538 | 20 kg × 50 reps showed as a 53 kg estimated 1RM and a 1RM PR over a real 50 kg single | Epley keeps climbing with reps, and nothing capped the reps fed to it (the unused Brzycki option went to Infinity at 37 reps) | e1RM counts at most `MAX_ESTIMATE_REPS` (15) reps; only PRP, which compares a lift with itself, opts out |
| #593 | CI caught a set reaching the server before its session, which Postgres rejected | `uuidv7()` ordered ids in the same millisecond by random bits, and the outbox drains in id order | Ids that set an order (outbox, supersede chains) must sort in creation order; `uuidv7()` keeps a per-millisecond counter |
| #531 | A set edited on two devices showed up twice | Both edits superseded the same row, and `resolveCurrentRows` kept every row nothing pointed at | A supersede chain can fork; resolving it keeps one tip per chain, the newest UUIDv7 id |
| #513 | Timed holds (plank) added zero weekly sets to a muscle, and the MCP let a plank be logged as reps | Muscle volume skipped any set without reps, and `log_past_workout` never checked the exercise's `trackingType` | A set counts when it has reps or seconds; MCP writes validate set fields against `trackingType` |
| #516 | MCP `volume_report` by week/exercise counted warm-up and cardio exercises, so it disagreed with `weekly_summary` | Only the by-muscle grouping applied `isStrengthExercise` | Filter non-strength exercises where sets are loaded (`resolvedSetsInRange`), not per grouping |
| #524 | After accepting a friend request, Home still showed the request badge and "Add a friend" | Home and Friends each held their own `useFriends()` state, and Home stays mounted under TabbedShell | Server data shown on more than one tab lives in one shared store, so an action on one tab updates the others |
| #523 | Reopened the next morning, Home showed yesterday as today and the PRP block-end recap never appeared | Both screens took `new Date()` once (memoized at mount) and iOS resumes the suspended app with that state | Screens that depend on the date use `useToday()` and list it in their memo deps |
| #521 | A drag on the "Add exercise" header scrolled the workout behind it, and the new-exercise form's Save could sit under the home indicator | The picker skipped the full-screen overlay rules: no scroll lock, no `touch-none` bars, no bottom safe area, not portaled | Every full-screen overlay follows docs/PWA.md §2 in full; check a new one against all five points |
| #519 | Tapping in and out of a routine target on the phone undid a change made on another device or by Claude | Target fields were seeded once and every blur wrote the local value, changed or not, which then won last-write-wins | A blur writes only fields that changed; inline fields resync from the stored row while the user isn't editing them |
| #518 | Editing a routine or program, a sync landing mid-edit replaced the name and notes being typed | The form copied the live `useLiveQuery` row into state on every change, not once | An edit form seeds its state from the stored row once (ref guard), and shows "not found" for a missing row instead of saving a new one |
| #517 | A failed Start, Save or Sign out left its button stuck on "Starting…"/"Saving…" with no message | The busy flag was set before an await and only cleared on success | Every busy flag is cleared in `catch`/`finally`, and the failure is shown next to the button |
| #515 | An MCP write naming an exercise that didn't exist logged to some other exercise with the same equipment or muscle | `resolveExercise` took the top `searchExercises` hit, and search falls back to equipment and muscles | Resolving one exercise from a name matches names and aliases only (`namesOnly`); a miss fails with suggestions |
| #510 | The MCP reported a PR count for workouts the phone showed 0 PRs for | `list_workouts` and `log_past_workout` counted PR rows of every kind, while the app counts only visible kinds (1RM) | Count PRs through `countVisiblePrs` in `@jim/core`, never with a local filter |
| #509 | A client registered as "Claude" with an attacker's redirect URI could phish a jim session through the MCP sign-in page | The page showed only the self-chosen client name, never the redirect host, and could be framed | A page that grants access names the host receiving it, says that it grants access, and sends `frame-ancestors 'none'` |
| #507 | An app update reloaded the page mid-workout and wiped a weight or note being typed | The `controllerchange` listener called `location.reload()` the moment the new service worker took over | An update reload waits until the user has left the app (`visibilitychange`), never while they are looking at it |
| #506 | An offline cold start could show a network error instead of the app | The service worker installed while signed out, precached "/" as its redirect to /login, and Safari refuses a redirected response for a navigation | The service worker never stores a redirected response; a navigation fallback serves only pages fetched without a redirect |
| #504 | Feedback could be spammed into GitHub issues, each carrying the sender's email, and a misconfigured server told the client which env vars it lacked | The route had no per-user cap, wrote `by ${email}` into a possibly public tracker, and returned the thrown config error's message | An endpoint that writes to an outside service has a per-user limit stored in Postgres; nothing personal leaves for a third party; config errors go to the server log and the client gets a generic message |
| #501 | Rows of a table the phone didn't store yet were skipped for good once it started storing it | The pull ignored unknown tables but still saved the cursor past their rows | The sync cursor records the Dexie schema version it was earned under; a newer schema pulls from the start once |
| #500 | A set with a fat-fingered weight never synced, and the badge said "pending" forever | The client accepted values past the server columns' range, and a mutation the server rejected was retried every cycle with no limit or error state | Validate set values against `SET_LIMITS` before queueing; a mutation rejected `MAX_PUSH_FAILURES` times shows as a sync error |
| #495 | Workout detail set rows ran past the screen edge at 393 px | The history set row had no `min-w-0` or wrap, so long labels (rest tags, PR chips) widened it | Rows that can grow get `min-w-0` and `flex-wrap`, like the portal row |
| #499 | Every MCP deploy signed every connector out at its next token refresh | Dynamically registered OAuth clients lived in a process-memory Map, so after a restart /token rejected the client_id as invalid_client | Anything a client must still find after a deploy is stored in Postgres, never in process memory |
| #490 | A phone edit that lost last-write-wins was reported as applied, so the phone kept its copy and never matched the server | A rejected LWW upsert is a silent no-op, and the winning row's server_seq didn't move, so no pull resent it | A push that loses LWW returns `stale` and bumps the winner's server_seq so the next pull repairs the device |
| #489 | A long history couldn't sync after signing in on a new phone or after sign-out | The pull returned every row since the cursor in one response, past Vercel's response size limit | Every list endpoint a client pages through has a limit and a has-more flag; the client loops |
| #488 | A sync pull could skip rows forever when an MCP write or another device committed during or just after it | server_seq is drawn at nextval but visible only at commit, and the pull advanced its cursor to the highest seq it saw | Writes for a user hold that user's advisory lock shared and the pull holds it exclusively, so the cursor never jumps an uncommitted seq |
| #497 | After merge_exercises, MCP tools still resolved names to the archived exercise, and a PRP block kept tracking the merged-away lift | Name resolution searched every exercise including archived ones, and the merge never touched `dpr_block_lifts` | Anything that repoints references to an exercise covers every table with an `exercise_id`, and name lookups skip archived rows |
| #496 | PRP suggested 137.5 lb on a barbell when the smallest plates were 2.5 lb | The default barbell step was 2.5 lb, and PRP rounded to that step instead of to what the plates can load | A barbell step is never smaller than a pair of the user's smallest plate |
| #494 | Workout volume and set counts on History, Home, the portal, the MCP and the friends feed included warm-up sets | `summarizeSession` summed every set it was given, and `friend_workouts` counted `*` | Count working sets only: summaries take each set's `kind` and skip warm-ups |
| #493 | Tapping outside the Sticky note or Rest timer dialog did nothing | Its backdrop `<button>` used plain `absolute` (the #356 bug again), and the dialog rendered in place inside the exercise section | Backdrop buttons use `absolute!`; overlays opened from a list row portal to `<body>` |
| #508 | Push subscribe accepted any https URL, so the server would POST to an attacker-chosen host | The endpoint check only looked at the protocol | Allowlist the push services' hostnames (exact or dot-suffix, never substring) for any URL the server later fetches |
| #492 | One tap on Remove Exercise mid-workout deleted every set logged for it, with no confirm or undo | The ⋯ menu action tombstoned the session exercise directly | Anything that deletes logged sets asks first or offers Undo |
| #491 | A fast double tap on ✓ saved the same set twice, and both counted toward volume and PRs | The Log buttons had no in-flight guard, and the set index only moves once the live query re-emits, after `completeSet` resolves | Guard every log with `useLogGuard`: one log in flight per section until the new set has rendered |
| #487 | After the session expired, sync stopped sending sets but still showed "Pending" with no way to sign in | The proxy redirected `/api/*` to `/login`; `fetch` followed it and the engine's `response.json()` threw on the HTML, so no status was ever set | API routes answer 401 JSON, never a redirect; sync treats 401 as `signed-out` and never assumes a body is JSON |
| #486 | A `/login?next=https://…` link could send a signed-in user to another site | Login, signup and the email-confirm route passed `next` to a redirect without the `safeNextPath` check the reset pages used | Every `?next=` that feeds a redirect goes through `safeNextPath` |
| #466 | Settings showed two Progression buttons | Settings home had its own Progression link and `DprSettings` (inside Workout) added another | One entry point per destination on a screen; grep the page's child components for the same `href` before adding a link |
| #458 | Edit exercise ran off the right edge: Model, the third Pulley button and the Gym picker were cut off | The Machine details `<fieldset>` kept the browser default `min-width: min-content`, so the Make/Model input row forced it wider than the screen despite `min-w-0` on the children | Reset `fieldset { min-width: 0 }` globally (guarded by a test); check every form at 393 px with all sections showing |
| #456 | Plank was logged by reps instead of seconds | The seed classifier gave every body-only strength exercise `bodyweight`, including isometric holds | Classify exercises by how they're measured: holds (plank, wall sit) are `time`, not reps |
| #444 | Forgot password on desktop web showed "Install Jim" and pages only loaded after a refresh | Recovery pages weren't exempt from the install gate, and the gate read `window.location.search` mid-navigation, before the URL updated | Read route state from the router (`usePathname`/`useSearchParams`), never `window.location` during render |
| #445 | History calendar shading stayed green whatever accent color was picked | Intensity classes hard-coded `emerald-*` instead of the accent tokens | Tint themed UI with `bg-accent`/`text-accent-foreground`, never a fixed palette color |
| #440 | PR sets pushed the set table past the card, clipping the ✓ column | The 🎉 PR marker sat inline beside the weight and widened the Weight column | Pin badges on table cells (`absolute` in a `relative` cell) so they add no column width |
| #438 | Deleting one warm-up set brought the warm-ups back after a sync | A deleted set's index was planned again as a fresh warm-up row (`index < warmupSets`), ignoring its synced tombstone | A planned row must not reappear where a synced tombstone says the user deleted it |
| #433 | "Invalid share" on a routine with a 900-minute warm-up | The share parser capped warm-up minutes, sets, reps and rest tighter than the routine editor does | A validator for data the app already saved must accept everything the app lets you save |
| #412 | The #410 fix turned the RPE info dropdown into a full-screen card, which felt heavier than a column header's tip | `FloatingCard` was used to escape the clipping instead of fixing where the dropdown was anchored | A dropdown that's too wide for its column can center in its card: anchor it to the `relative` card, not the cell |
| #410 | RPE info popup was cut off on the left and unreadable | Anchored `absolute right-0` popup (#183) sat inside a narrow row, so its left side ran off-screen | Don't anchor a wide popup to a narrow cell near the edge (superseded by #412) |
| #395 | Volume by muscle counted warm-up sets as weekly sets and volume | Only warm-up *exercises* were filtered, not warm-up sets on a working exercise | Count working sets only |
| #387 | Routine rows painted through the DPR details card on the Workout tab | `FloatingCard` rendered inside the routine `<li>`, inside the shell scroller, so its `fixed z-20` was out-ranked | Portal overlays to `<body>` (`docs/PWA.md` §4) |
| #381 / #382 | Warm-ups shifted Prev values and showed up as extra working sets next time | Last session's sets matched by index across kinds | Match sets by kind and position |
| #374 / #376 | Square colored corners showed outside frosted glass cards on iPhone | iOS Safari doesn't clip a `filter: blur` layer to `border-radius` | Draw glass with gradients inside the shape |
| #356 / #357 | Pre-workout card: backdrop tap did nothing, Cancel needed two taps | The global button rule overrode `absolute`; close waited on an `animationend` iOS dropped | `absolute!` on buttons; timeout backstop on exit animations |
| #327 / #343 | Home stats and History buttons ran off the right edge with no scroll hint | Fixed-width rows of items at 393 px | Grid or wrap; check at 393 px |
| #320 / #336 | Strength-standard chips suggested 51.08 and 231.43 | Raw computed weights shown and copied into the field | Round to loadable weights |
| #318 / #334 | A double tap on ✓ deleted the set just logged | The Log button turned into a trash button in the same spot | Never put a destructive control where the confirming tap lands |
| #309 / #310 | Home's header behaved differently from every other tab | A one-off header instead of `PageHeader` | Use the shared header |
| #299 / #300 | Home and Profile looked squeezed compared to other pages | `max-w-xs` cap and `px-6` gutters | Use `PAGE_BODY` |
| #227 / #229 | Rest timer showed through the Add exercise screen | Same z-index, and the timer came later in the DOM | Follow the z-index scale; overlays at `z-20`+ |
| #194 / #196 | Dragging the tab bar scrolled the whole page off screen | The document itself could scroll | `overflow: hidden` on `<html>` and `<body>` in the PWA |
| #167 / #168 | The RPE info popup widened the page | An `absolute` popup near the edge grew the scroll bounds | Open away from the edge; cap to the viewport |
| #110 / #114 | Start buttons stayed greyed out after cancelling a workout | A "starting" flag never reset on a hidden, still-mounted tab | Reset busy state on every exit path |
| #115 | An old release note re-sent on a deploy | `LATEST_RELEASE_NOTE` wasn't updated | Update the note in every user-visible PR |

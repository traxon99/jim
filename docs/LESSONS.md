# Shipping lessons

**Check every diff against this checklist before it merges: every PR, every auto-ship run, human or
agent.** Each line is a mistake that already reached the user's phone, and the rule that would have
stopped it. In auto-ship, a review subagent does this pass (`.claude/skills/auto-ship/SKILL.md`
step 5); otherwise go through it yourself. Only the sections your diff touches apply.

The history behind each issue number is in [`LESSONS-LEDGER.md`](LESSONS-LEDGER.md). It isn't
required reading. When you fix a bug, add a row to the top of the ledger in the same PR, and add
the rule here (or as a guard test) if it isn't covered yet.

Rules marked **(guard test)** fail CI on their own (`apps/web/app/__tests__/lesson-guards.test.ts`
and `layout-guards.test.ts`). Deeper background lives in `docs/PWA.md` (layout, scrolling,
overlays, iOS), `docs/ARCHITECTURE.md` and `docs/DECISIONS.md` (local-first data, sync).

---

## Pre-ship checklist

Answer each one that your diff touches. If you can't verify one from here, say so in the PR body.

**Overlays, popups and cards**
- [ ] Does anything open over the page from inside a list row, card or other in-flow component? It
      must render through `FloatingCard` (portaled to `<body>`) or its own `createPortal`. A `fixed`
      div rendered in place can be painted over by the rows after it (#387, #493).
- [ ] Is a new `absolute`/`fixed` element a `<button>`? The global ripple rule makes every enabled
      button `position: relative`, which beats plain Tailwind `absolute`. Use `absolute!` (#356,
      #493; guard test).
- [ ] Hanging a badge off a button? The ripple rule also gives buttons `overflow: hidden`, so it
      gets clipped. Put it on a `relative` wrapper beside the button (#522).
- [ ] Does closing wait on `animationend`/`transitionend`? iOS drops it when an animation is
      interrupted. Add a timeout backstop (#356).
- [ ] A new full-screen overlay? It follows all five points of `docs/PWA.md` §2: scroll lock,
      `touch-none` bars, bottom safe area, portaled (#521).
- [ ] Did you check the z-index scale in `docs/PWA.md` §4, and open the overlay during an active
      workout with the rest timer running (#227)?
- [ ] A wide popup or dropdown? Anchor it to the `relative` card, not a narrow cell near the edge,
      and cap it to the viewport (#167, #412).

**Layout at 393 px**
- [ ] No `max-w-*` cap or extra gutters on a page body. Every pushed screen uses `PageHeader` +
      `PAGE_BODY` (full width, `px-4`) instead of a one-off header (#299, #309, #547).
- [ ] Rows that can grow have `min-w-0` and either truncate, wrap or scroll. Check at 393 px with
      real-length text (#327, #182, #495).
- [ ] Adding a badge or icon to a table cell? Pin it (`absolute` in a `relative` cell) instead of
      setting it inline, or it widens the column and pushes the row past the card (#440).
- [ ] Building or changing a form? Load it at 393 px with every optional section showing and the
      longest realistic values, then try to scroll sideways. Native elements carry their own
      minimum widths: `<fieldset>` defaults to `min-width: min-content` (reset globally in
      `globals.css`, so never give one `min-w-min`/`min-w-fit`; guard test), and
      `<input>`/`<select>` keep an intrinsic width unless they and every flex/grid ancestor have
      `min-w-0`. Fixing one form? Sweep its siblings (#458, #526).
- [ ] Blur, filters and glass: iOS Safari doesn't clip a CSS-`filter`ed layer to its parent's
      rounded corners. Use gradients inside the shape instead (#374, #376).
- [ ] Themed color? `bg-accent`/`text-accent-foreground`, never a fixed palette color (#445).
- [ ] Adding a rule to `globals.css` that targets elements (`*`, `button`, `input`…)? Put it in
      `@layer base`. Unlayered CSS beats every Tailwind utility, which is how one rule switched off
      every `touch-none` (#663; guard test for `touch-action`).

**Taps and destructive actions**
- [ ] Can a fast double tap run a save twice? Guard it until the result has rendered, not just until
      the promise resolves (`useLogGuard`, #491). A picker accepts one pick per opening (#550).
- [ ] Can a second tap land on something destructive? Never swap a delete/cancel control into the
      spot the user just tapped to confirm. A double tap on ✓ deleted the set it had just logged
      (#318).
- [ ] Does a new delete take effect in one tap? List rows get the shared `UndoBar` /
      `useUndoable`; removals that lose configuration ask with `confirm()` first. Anything that
      deletes logged sets asks or offers Undo (#492, #520).
- [ ] Does a disabled or "busy" state reset on every exit path, including a thrown error, cancel and
      switching tabs? Clear it in `catch`/`finally` and show the failure next to the button. Hidden
      tabs stay mounted and their effects keep running (#110, #517, `docs/PWA.md` §8).
- [ ] A retry after a partial failure? Resume after the step that already committed; don't repeat
      it (#530).
- [ ] A `<Link>`/`<a>` styled as a button carries `data-ripple` (`docs/PWA.md` §7; #546, guard
      test).

**Forms and live data**
- [ ] Does an edit form copy a `useLiveQuery` row into state? Seed it once, so a sync landing
      mid-edit can't replace what's being typed, and show "not found" for a missing row (#518).
- [ ] Inline fields write on blur? Write only the fields that changed, and resync from the stored
      row while the user isn't editing (#519).
- [ ] Server data shown on more than one tab lives in one shared store (like `useFriends`), so an
      action on one tab updates the others (#524, #653).
- [ ] Depends on today's date? Use `useToday()` and list it in memo deps; iOS resumes a suspended
      app with yesterday's state (#523).
- [ ] A `setTimeout`/`setInterval` in a component or hook? Keep it in a ref and clear it on
      unmount (#549).
- [ ] A screen that loads from the network? A failed load shows the error with Try again (#543).

**Workout and set logic**
- [ ] Matching this session's sets against last time's? Match by set kind **and** position, never by
      raw index. Warm-ups shifted Prev values and turned into extra working sets (#381).
- [ ] Showing a stored weight, reps or RPE? Format it (`formatSetValue`): synced values are
      Postgres numeric strings like "100.00" and "10.0", wider than phone-logged ones (#646).
- [ ] Showing or pre-filling a computed weight? Round it to what the user's bar and plates can load
      (`nearestLoadableWeight`), never raw math like 51.08. A barbell step is never smaller than a
      pair of the smallest plate (#320, #496).
- [ ] Counting training volume or sets? Working sets only: leave out warm-up sets
      (`kind === "warmup"`), warm-up exercises and non-strength exercises (filter where sets are
      loaded). A set counts when it has reps **or** seconds (#395, #494, #513, #516).
- [ ] Counting PRs? Use `countVisiblePrs`. Estimating a 1RM? Reps cap at `MAX_ESTIMATE_REPS`.
      Writing history into the past? Re-check the PR rows after it (#510, #537, #538).
- [ ] Creating or editing an exercise (app form or MCP)? A strength exercise must keep at least one
      primary muscle (`muscleTagsError`), and a muscle is primary or secondary, never both
      (`withoutPrimary`). Holds are `time`, not reps (#456, #643).
- [ ] Showing an exercise? `exerciseDisplayName` and `exerciseMetaLine`, never `exercise.name` or a
      re-implemented list line (#548). One shared row component per list item (#552).
- [ ] Bounds the app already enforces (RPE, set values) come from shared constants (`RPE_MIN`,
      `RPE_MAX`, `SET_LIMITS`), never literals (#500, #512; guard test for RPE).
- [ ] Repointing references to an exercise (merge, archive)? Cover every table with an
      `exercise_id`; name lookups skip archived rows (#497).
- [ ] Sets are append-only and sync is foreground-driven (`docs/DECISIONS.md`). Don't edit rows in
      place. A planned row must not reappear over a synced tombstone (#438).

**Sync and the server**
- [ ] Ids that set an order sort in creation order (`uuidv7()`); a supersede chain can fork, and
      resolving it keeps one tip per chain (#531, #593).
- [ ] Something several triggers can start (boot, visibility, timers)? Single-flight it (#532).
- [ ] A list endpoint a client pages through has a limit and a has-more flag (#489). API routes
      answer 401 JSON, never a redirect (#487).
- [ ] Writes for a user go through `runAsUser` (advisory lock); a push that loses LWW returns
      `stale` and bumps the winner's `server_seq` (#488, #490). The sync cursor carries the Dexie
      schema version (#501).
- [ ] State a client must still find after a deploy lives in Postgres, never process memory (#499).
- [ ] Server-side calendar math uses the user's stored IANA time zone, never the server's (#511).
- [ ] A validator for data the app already saved accepts everything the app lets you save (#433).
- [ ] The service worker never stores a redirected response; it caches the page a navigation lands
      on (by final URL) and falls back to `/workout`. Check an offline cold start. An update reload
      waits until the user has left the app (#506, #507, #661).
- [ ] An unreachable server (thrown fetch, timeout) is `offline`, shown neutral; red is for 5xx and
      rejected rows. Every sync request has a timeout (#665, #684).
- [ ] Keep `app/error.tsx` and `app/global-error.tsx` on the shared `ErrorScreen` (#664).
- [ ] A notification that opens a page posts `jim-navigate` to the focused app rather than just
      focusing it, and the app checks for updates when it returns to the foreground (#667, #671).

**MCP tools**
- [ ] A new thing a user can do in the app gets a matching MCP tool (see auto-ship step 4).
- [ ] Deletes and cancels take `dryRunParam(true)` (#539). Date-times use the shared schema with
      `{ offset: true }`; a calendar day is stored as noon UTC (#540).
- [ ] Resolving one exercise from a name matches names and aliases only (`namesOnly`); routines
      resolve through `findRoutine`. Set fields are validated against `trackingType` (#513, #514,
      #515).
- [ ] Database errors reach the caller as a generic message (#514).

**Routing, links and security**
- [ ] Moved a feature to a new screen? Grep for links to its old home and repoint them (#543,
      #654). Before adding a link, check that the header, tab bar or a child component doesn't
      already reach it (#466, #528).
- [ ] Redirecting to a `?next=` (or any URL from the request)? Pass it through `safeNextPath` so it
      can only be a path on this origin (#486).
- [ ] Reading the URL during render? Use `usePathname`/`useSearchParams`, not `window.location`,
      which still holds the previous page during a client-side navigation (#444).
- [ ] Adding a page a desktop browser must reach (portal, auth)? Check it against
      `isInstallGateExempt` in a non-installed desktop browser (#444).
- [ ] Does a route call an outside service (GitHub, push, email)? Give it a per-user limit kept in
      Postgres, send no email or other personal data, and keep env var names out of error responses
      (#504).
- [ ] A new mutating `/api/*` route is covered by the proxy's `Origin` check; a server-to-server
      exception is listed explicitly (#535). Webhook signatures are verified against the URL too
      (#534). A URL the server will fetch is checked against a hostname allowlist (#508).
- [ ] A page that grants access names the host receiving it and sends `frame-ancestors 'none'`
      (#509). Third-party data is pinned to a commit SHA and its enums validated (#505).

**Accessibility**
- [ ] State shown only by color or a ring also has text: `aria-label` with the facts, and
      `aria-pressed` on toggles (#529).
- [ ] A row's controls are labelled with the number the row shows; every `<select>` has an
      `aria-label` (#545; guard test for selects).

**Release**
- [ ] `LATEST_RELEASE_NOTE` in `apps/web/lib/pwa/notifications.ts` describes *this* change. Every
      merge re-sends it, so a stale note goes out again (#115).
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass locally. jsdom tests can't catch layout
      bugs, so for UI changes also follow `docs/PWA.md` §10 (`pnpm dev:stack` gives you the real
      signed-in app).

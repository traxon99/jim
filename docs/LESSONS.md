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
- [ ] Use `PageHeader` for a tab's header instead of building a one-off one (#309).
- [ ] Blur, filters and glass: iOS Safari doesn't clip a CSS-`filter`ed layer to its parent's
      rounded corners. Use gradients inside the shape instead (#374, #376).

**Taps and destructive actions**
- [ ] Can a second tap land on something destructive? Never swap a delete/cancel control into the
      spot the user just tapped to confirm. A double tap on ✓ deleted the set it had just logged
      (#318).
- [ ] Does a disabled or "busy" state reset on every exit path, including cancel and switching
      tabs? Hidden tabs stay mounted and their effects keep running (#110, `docs/PWA.md` §8).

**Workout and set logic**
- [ ] Matching this session's sets against last time's? Match by set kind **and** position, never by
      raw index. Warm-ups shifted Prev values and turned into extra working sets (#381).
- [ ] Showing or pre-filling a computed weight? Round it to what the user's bar and plates can load
      (`nearestLoadableWeight`), never raw math like 51.08 (#320).
- [ ] Counting training volume (sets, weight × reps, per muscle)? Count working sets only: leave
      out warm-up sets (`kind === "warmup"`) as well as warm-up exercises (#395).
- [ ] Sets are append-only and sync is foreground-driven (`docs/DECISIONS.md`). Don't edit rows in
      place.

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
| #410 | RPE info popup was cut off on the left and unreadable | Anchored `absolute right-0` popup (#183) sat inside a narrow row, so its left side ran off-screen | Info popups from small triggers use `FloatingCard`, not an anchored `absolute` div |
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

# PWA design principles

What this app has learned, mostly the hard way, about making a Next.js web app feel native as an
installed iPhone PWA. Read this before building or changing any screen, overlay, popup, input,
or anything touching the service worker. Every rule here comes from a bug that shipped. The issue
or PR number is next to each rule so you can read the full history.

`docs/ARCHITECTURE.md` §2 (platform constraints) and §6 (iPhone 16 specifics) have the original
design. This file adds what was learned since, and why.

---

## 1. The layout model (learn this first)

Most of the bugs below came from breaking this model without meaning to.

```
<html>                    overflow: hidden (installed only), overscroll-behavior: none
└─ <body>                 h-lvh, flex column, padding-top: safe-area-inset-top,
   │                      overflow: hidden (installed only)
   └─ (shell)/layout.tsx  flex-1 min-h-0 flex column
      ├─ scroll container flex-1 min-h-0 overflow-y-auto   ← THE ONLY THING THAT SCROLLS
      │  └─ TabbedShell   5 tabs kept mounted via <Activity>, plus routed children
      ├─ SyncStatusIndicator
      └─ BottomTabBar     shrink-0, pads its own bottom safe area
```

- **The document never scrolls in the installed app.** `:root:has(body.pwa), body.pwa {
  overflow: hidden }` in `app/globals.css`. Every screen scrolls inside the shell's overflow
  container. Before this, any overflow past `<body>` let a drag starting on a non-scroller (the
  tab bar, a screen header) scroll the whole document, tab bar and all, up off the screen (#194,
  #196). `overflow` has to be set on both `<html>` and `<body>`, because body's overflow only
  reaches the viewport when html's is `visible`.
- **Body is a fixed `h-lvh`, not `min-h-*`.** `min-h-lvh` let the document grow on long pages, so
  the tab bar scrolled away instead of staying pinned (db37dbf).
- **Use `lvh`, not `dvh` or `svh`.** iOS WebKit computes `dvh` against the *small* viewport on
  first paint, even in standalone mode where no toolbar ever shows. That left the tab bar too high,
  or a gap under it, until a scroll forced a recalculation (41baf9d, 9a28952). The app only runs
  standalone (the install gate blocks everything else), so the viewport height is fixed and `lvh`
  is right from the first frame.
- **`min-h-0` all the way down the flex chain.** A flex child defaults to `min-height: auto`, so it
  won't shrink below its content. Without `min-h-0` on every flex ancestor, the inner
  `overflow-y-auto` never kicks in and the page grows instead of scrolling. Any new wrapper `div`
  between the shell and a screen needs `flex min-h-0 flex-1 flex-col` (see `tabbed-shell.tsx`).

### Checklist for a new screen

- [ ] It renders inside the shell's scroll container. It doesn't add its own `h-screen`,
      `h-dvh`, or `100vh` height.
- [ ] Any wrapper it adds keeps `min-h-0 flex-1` if it's part of the flex chain.
- [ ] Nothing in it is wider than the viewport (see §3).

---

## 2. Scrolling and touch

### Full-screen overlays must lock what's underneath

Any `fixed inset-0` overlay (Focus view, the exercise picker, anything modal and full-screen):

1. **Lock `<html>` and `<body>` overflow while it's mounted,** and restore the previous value on
   unmount. `position: fixed` doesn't stop the page behind it from scrolling. A drag that starts
   on the overlay's non-scrolling bars scrolls the page underneath (#195). See the second
   `useEffect` in `components/workout/focus-view.tsx`.
2. **Mark its fixed bars (header, footer, button rows) `touch-none`** so drags on them don't chain
   anywhere.
3. **Give the overlay `overscroll-none`** and its scrolling middle `overflow-y-auto
   overscroll-contain min-h-0 flex-1`, so scrolling hits the end without chaining to the document.
4. **Pad its own safe areas.** `fixed` skips body's `padding-top: env(safe-area-inset-top)`, so
   the overlay needs `paddingTop: env(safe-area-inset-top)` itself, or its header sits under the
   Dynamic Island (db37dbf). If it reaches the bottom edge, pad the bottom too:
   `max(12px, env(safe-area-inset-bottom))`.
5. **Pick a z-index that beats every sibling it covers** (see §4).

### The keyboard leaves the document scrolled

iOS scrolls the document, even though it's otherwise unscrollable, to lift a focused input above
the keyboard. It doesn't reliably scroll back when the keyboard closes, which leaves the tab bar
and Focus view's bottom bar stranded partway up the screen (#205, #206). `components/pwa-chrome.tsx`
fixes this globally: when nothing that raises the keyboard is focused, it resets any leftover
document scroll to `0,0`. It checks on `focusout` (one frame later, so hopping between inputs
isn't mistaken for a close), on `window` scroll, and on `visualViewport` resize.

- Don't add a per-screen fix for this. The global one covers every input.
- If you add a new kind of keyboard-raising element, make sure `KEYBOARD_TARGET_SELECTOR` in
  `lib/pwa/keyboard-scroll.ts` matches it.
- Never set `window.scrollTo` or document scroll yourself to position content. Scroll the shell's
  container or the element.

### Pull-to-refresh and rubber-banding

`overscroll-behavior: none` has to be on `:root`. On `<body>` it never reaches the viewport and
does nothing, which is how it shipped at first (579b923).

### Drag handles

Reorder handles (`routine-exercise-row.tsx`, `program-routine-row.tsx`) are `touch-none` so a drag
reorders instead of scrolling the list.

---

## 3. Never widen the page

A narrow phone (393 CSS px) plus anything that overflows horizontally means a sideways-scrolling
page. That looks broken, and it also enlarges the scroll container's bounds vertically.

### Rows that can outgrow the screen

A flex row with a title and a set of links or buttons: the part that can grow needs **`min-w-0`**
(flex items default to `min-width: auto` and refuse to shrink) **plus `overflow-x-auto`**, so it
scrolls within itself. The History page nav pushed the whole page wider once a third link was
added (#182, #189). This bites whenever a feature adds "just one more" item to an existing row.

### Popups and dropdowns

An `absolute` popup anchored near the edge of the screen extends past the viewport and grows the
scroll container's bounds (#167, #168). The pattern now:

- **Open away from the nearest edge.** `SetKindMenu` sits at the left of the row and anchors
  `left-0`. `RpeInfoMenu` and the ⋯ `ExerciseActionsMenu` sit near the right and anchor
  `right-0`, so they open leftward (#183, #184, #269).
- **Cap its size to the viewport:** `max-w-[calc(100vw-2rem)]`, plus
  `max-h-[calc(100vh-2rem)] overflow-y-auto` if it can be tall.
- A `fixed`, viewport-centered overlay with a backdrop can never affect scroll bounds, so use one
  when a popup can't be anchored safely (that was the first #168 fix).
- Close on outside `pointerdown` and on `Escape`, like both existing menus do.

### Checklist for anything new that's wide or pops up

- [ ] Check it at 393px wide, with the trigger at both the left and right edges if it can move.
- [ ] Open the popup, then try to scroll sideways. The page shouldn't move.
- [ ] Row items that can grow have `min-w-0` and either truncate (`truncate`) or scroll
      (`overflow-x-auto`).

---

## 4. Stacking (z-index)

Siblings with the same z-index stack in DOM order, so the one rendered later wins. The rest timer
(`sticky bottom-0 z-10`) rendered after the exercise picker (`fixed z-10`) in
`active-session.tsx` and painted over the full-screen "Add exercise" view (#227, #229).

The current scale:

| z | What |
|---|---|
| `z-10` | In-flow chrome and small popups: `RestTimerBar` (sticky), `SetKindMenu`, `RpeInfoMenu`, `ExerciseActionsMenu` |
| `z-20` | Full-screen overlays: `FocusView`, `ExercisePicker` (never shown together) |
| `z-50` | Boot `LoadingScreen` (above everything) |

A new full-screen overlay goes at `z-20` or above. Add a comment next to the class saying what it
has to beat and why, like `exercise-picker.tsx` does. Then open it over every screen it can
appear on, including during an active workout while the rest timer is running.

---

## 5. Safe areas and the bottom bar

- `viewport-fit=cover` is set, so content goes under the notch and home indicator unless padded.
- **Top:** body pads `env(safe-area-inset-top)` globally. `fixed` elements skip this and pad
  themselves (§2).
- **Bottom:** each screen pads its own bottom. The tab bar uses
  `max(6px, min(env(safe-area-inset-bottom), 34px))`. The inset came back larger than the real
  home-indicator inset and left a big empty gap, so it's capped at 34px (63c0e5e).
- The status bar is `black-translucent`, so content under it has to be padded, not just colored.

---

## 6. Inputs and zoom

- **16px minimum font on every `input`, `select`, `textarea`.** Anything smaller makes iOS zoom
  in on focus. It's set globally in `globals.css`. Don't override it with a smaller Tailwind
  `text-*` on an input.
- `touch-action: manipulation` globally stops double-tap zoom and the 300ms tap delay. It
  *doesn't* stop pinch-zoom, so the viewport also sets `maximumScale: 1, userScalable: false`
  (3d6bb81). iOS honors this only in standalone mode.
- `inputmode="decimal"` for weights and `inputmode="numeric"` for reps.

---

## 7. Feeling native, not like a browser

These apply **only when installed** (`body.pwa`, set by `components/pwa-chrome.tsx` from
`display-mode: standalone` or `navigator.standalone`). In a browser tab (the web portal is exempt
from the install gate and runs there) the same restrictions just feel broken, so every new
"native feel" rule has to be gated on `body.pwa` or `isStandalone()` too.

- **Text selection and the long-press callout are off** (`user-select: none`,
  `-webkit-touch-callout: none`). Add `.allow-pwa-select` to anything the user might want to copy:
  errors, logged numbers, PRs, instructions.
- **The long-press context menu is suppressed** except on real links, media, text entry,
  `.allow-pwa-select`, or when text is already selected (`lib/pwa/context-menu.ts`, unit-tested).
- **An `<a>` used as a button has to carry `data-ripple`.** Next's `<Link>` is an `<a href>`, so
  without the tag it counts as a hyperlink and long-pressing it shows iOS's "Open in New Tab"
  (#72). `data-ripple` also gives it the tap ripple.
- **No tap highlight:** `-webkit-tap-highlight-color: transparent` on controls.
- **No haptics.** `navigator.vibrate` doesn't exist on iOS, and the workarounds were unreliable and
  were removed (#149). Tap feedback is the ripple (`components/ripple-effect.tsx`). It covers every
  `<button>` and `[data-ripple]` automatically, and `button:not(:disabled)` gets
  `position: relative; overflow: hidden` for it, so bear that in mind if a button needs an overflowing
  child (a badge, say).
- Respect `prefers-reduced-motion` on every animation (see the existing ones in `globals.css`).
- Tap targets are at least 44×44 (`min-h-11 min-w-11`), and primary workout controls go in the
  bottom third of the screen.

### Transitions between screens

A screen or overlay that just appears or disappears feels like a web page reloading, not an app
(#275). Unlike the rules above, this applies in a browser tab too, so it isn't gated on `body.pwa`.
Every new page, overlay, or sheet needs a transition in and out. Reuse the classes in `globals.css`
rather than writing new keyframes:

- **Tab switches:** `.page-fade` (120ms), already applied by `components/tabbed-shell.tsx`.
- **Routes outside the tab bar and full-screen overlays** (e.g. `/workout/[id]`, focus view):
  `.route-fade` (220ms). `TabbedShell` applies it to routed pages. Also put it on content that
  replaces a "Loading…" placeholder, so the swap doesn't snap.
- **Sheets and floating cards:** `.sheet-backdrop` on the backdrop and `.sheet-panel` on the
  card. The backdrop fades while the card rises. To close, set `data-closing="true"` and unmount on the
  backdrop's own `animationend`. Under reduced motion, skip straight to unmounting, because no
  `animationend` fires (`components/workout/pre-workout-sheet.tsx`).
- Keep transitions short (under ~250ms) and opacity/transform only. Put a `transform` animation on
  the sheet itself, never on an ancestor of a `fixed` element: a transformed ancestor becomes the
  containing block and breaks `fixed` positioning.

---

## 8. App lifecycle: suspended, not killed

An installed iOS PWA is **suspended** when it's backgrounded, not killed. Reopening it can resume
the exact same in-memory JS, React state included, indefinitely.

- **Tabs stay mounted** (`components/tabbed-shell.tsx`, `<Activity mode="hidden">`), so local
  component state survives tab switches as well as backgrounding. Anything temporary (a "starting…"
  lock, an open menu, a draft) has to be reset when its tab is hidden or it's left behind. The
  Start button stayed disabled forever after a cancelled workout for exactly this reason (#110,
  #114). Effects in hidden tabs still run, so gate any navigation or redirect on the tab being
  visible (#78).
- **A new service worker has to force a reload.** `self.clients.claim()` takes control of the page,
  but the running app keeps its old JS. `register-service-worker.tsx` reloads once on
  `controllerchange`, and only if there was a previous controller, so a first install doesn't
  reload itself (#117). Without this a deployed fix can look like it never shipped.
- **Timers:** never count with `setInterval`. Store an absolute end time and recompute it on
  resume. Anything that must happen while backgrounded (the rest-timer alert) is a server-sent
  Web Push, because the page's JS isn't running then (ARCHITECTURE constraint 4, ADR-014).
- **Wake lock:** Safari releases it whenever the page is hidden, so `lib/wake-lock.ts` requests it
  again on every `visibilitychange` back to visible.
- **No Background Sync on iOS.** Sync is foreground-driven only (ARCHITECTURE constraint 1).

## 9. Service worker and releases

- `public/sw.js` is generated at build time from `public/sw.template.js` by
  `scripts/generate-sw.mjs`, and only in production. It doesn't exist in dev. Edit the template,
  not `sw.js`.
- Every production deploy pushes a "Jim updated" notification to every device, with
  `LATEST_RELEASE_NOTE` (`lib/pwa/notifications.ts`) as its text. **Update that string in every
  user-facing change.** The service worker changes on every build whether or not the note did, so
  a stale note gets resent on every deploy (#115).
- **The service worker caches static assets only.** Cache-first is limited to `/_next/static/`,
  icons, splash screens and the manifest (`isStaticAsset` in the template). Never cache `/api/*` or
  RSC (`?_rsc=`) responses: they are per-user, and a cached `/api/sync/pull?since=0` served the
  previous account's rows to the next account signed in on the device (#289).
- Every `push` has to show a notification (Safari and Chrome require it, `userVisibleOnly`). Don't
  add silent pushes.
- Web Push only works when the app is installed.

---

## 10. Verifying a UI change

jsdom unit tests won't catch any of the layout bugs above. For anything that touches layout,
overlays, popups, or inputs:

1. Run it at **393 × 852** (iPhone 16), and also at 430 wide if the layout depends on width.
2. **Standalone mode matters.** `body.pwa` and all the installed-only CSS only apply under
   `display-mode: standalone`. In Chromium, open it as an app window (or emulate the media
   feature) so you're testing the real path.
3. Try the things that broke before:
   - drag from the tab bar and from each fixed header or footer (the page must not move),
   - scroll to the bottom of the longest list and keep pulling,
   - open every popup near both screen edges, then try to scroll sideways,
   - focus an input, close the keyboard, and check that the tab bar is back at the bottom,
   - open each overlay during an active workout with the rest timer running,
   - switch tabs mid-action, come back, and check that no stale state is left behind.
4. Things only a real iPhone shows: keyboard scroll behavior, the `dvh` first-paint bug, safe-area
   insets. If you can't test on a device, say so in the PR rather than implying it was verified.

Pure policy logic (`context-menu.ts`, `keyboard-scroll.ts`) lives in `lib/pwa/` as plain functions
with unit tests, and the DOM wiring stays thin in a component. Follow the same split for new PWA
behavior.

---

## Adding to this document

When you fix a PWA, layout, scrolling, or iOS-specific bug, add the lesson here in the same PR:
the rule, one line on what broke, and the issue or PR number.

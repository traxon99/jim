---
name: mockup
description: Before/after mockup board for a proposed jim UI change. Real-app screenshots as "before", an HTML mockup as "after", side by side in light and dark. Use for "/mockup", "mock up", "show me before and after", or any proposed redesign Jackson should see before it is built.
---

# Mockup: before and after

The deliverable is one **board** per topic: for every screen the change touches, the app as it is
today beside the proposed version, in light and dark. Jackson picks from the board, so it shows
the change and nothing else.

Everything goes in `/mnt/project-files/screenshots/<topic>/` (kebab-case topic, e.g.
`start-workout`):

```
before/<screen>-light.png  before/<screen>-dark.png    real app, today
after/<screen>-light.png   after/<screen>-dark.png     the proposal
mockup-source.html                                     the "after" screens (?dark, ?screen=<name>)
board.html                                             the side-by-side board
overview-light.png  overview-dark.png                  the board, rendered
scripts/                                               any flow script, to reproduce "before"
```

## Steps

1. **Scope.** List the screens and states the change touches (an open sheet, a scrolled list, an
   empty state count as their own screens). Done when each has a short `<screen>` name.

2. **Before.** Follow the `run-app` skill: start `pnpm dev:stack`, then shoot each screen in both
   schemes with `pnpm dev:shot <route> <dir>/before/<screen>-light.png` and again with `--dark`.
   For a state behind a tap, write a flow script with `openApp`/`goTo` and save it under
   `scripts/`. Done when every screen has a light and dark PNG you have looked at.

3. **After.** Write `mockup-source.html` as a 393×852 phone screen that copies the real app's
   look: tokens from `apps/web/app/globals.css`, the same fonts, icons (Solar) and spacing, and
   the "before" shot's content and data, so the only difference is the proposal. Follow the
   `apple-design` skill and `docs/ANIMATION.md` for anything that moves. No explainer captions or
   helper text on the screens (docs/PWA.md §7). Theme off `?dark`, pick screens with
   `?screen=<name>`. Render each:

   ```
   pnpm mockup:render "<dir>/mockup-source.html?screen=<screen>" <dir>/after/<screen>-light.png
   pnpm mockup:render "<dir>/mockup-source.html?screen=<screen>" <dir>/after/<screen>-dark.png --dark
   ```

   Done when every "before" PNG has a matching "after" PNG and you have looked at each.

4. **Board.** Write `board.html`: a title, then one row per screen with Before on the left and
   After on the right, each image at phone size with rounded corners, plus a one-line label per
   row naming what changed. Several options for one screen go as extra columns (After A, After
   B). Render both schemes:

   ```
   pnpm mockup:render <dir>/board.html <dir>/overview-light.png --width=1100 --full
   pnpm mockup:render <dir>/board.html <dir>/overview-dark.png --width=1100 --full --dark
   ```

   Done when both overviews show every row with its pair side by side.

5. **Deliver.** Attach `overview-light.png` and `overview-dark.png`, and name the folder. Say
   which data the "before" shots used and anything the mockup could not show (real-device
   behavior, motion).

## Notes

- `mockup:render` passes `?dark` itself; put a `?screen=` query in quotes so the shell keeps it.
- A board for a whole new screen with no "before" keeps the Before column with the closest
  existing screen, or drops it and says so.
- Past boards in `/mnt/project-files/screenshots/` (`clunky-redesign`, `completed-sets-v2`,
  `start-workout`) are good references for the mockup HTML.

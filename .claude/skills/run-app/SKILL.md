---
name: run-app
description: Run jim's real signed-in PWA locally (seeded test user, throwaway database) to see, tap through or screenshot a UI change at iPhone size. Use for docs/PWA.md §10 checks, auto-ship screenshots, or any "run the app" / "show me the screen" ask.
---

# Run the app

`pnpm dev:stack` runs the unchanged app against local stand-ins, so nothing touches production:

- a throwaway Postgres under the OS temp dir (port 54329), reset and seeded on every start with
  `dev@jim.test`: onboarded, a "Push Day" routine and six workouts over three weeks
- a local stand-in for Supabase Auth (port 54321) that knows only that user
- `next dev` on port 3000, with push, QStash, feedback and the MCP link off

## Steps

1. Start it in the background and wait for `Ready in` in its output (the first start runs
   `initdb` and seeds the ~900-exercise catalog, about 20 s):

   ```
   pnpm dev:stack > /tmp/dev-stack.log 2>&1   # in the background; add --keep to skip the reseed
   ```

2. Screenshot a screen as an installed iPhone app (393×852, touch, standalone):

   ```
   pnpm dev:shot /history                        # → $TMPDIR/jim-dev-shots/_history.png
   pnpm dev:shot /workout shots/workout.png --dark
   ```

   It signs in, waits for the boot splash and the catalog pull, then shoots. Read the PNG to
   check it.

3. To tap through a flow first (open an overlay, start a workout, drag), write a short script
   next to your work that imports `openApp` and `goTo` from `apps/web/scripts/dev-stack/shot.ts`,
   drives `page` with Playwright, and calls `page.screenshot`. Run it with
   `pnpm --filter @jim/web exec tsx <script>`. Walk the `docs/PWA.md` §10 list for any change
   to layout, overlays or inputs.

The step is done when you have looked at a screenshot of every screen the change touches, in
light and dark.

## Limits

- Real-iPhone behavior (keyboard scroll, `dvh` first paint, safe-area insets) still needs a
  device. Say so in the PR.
- Standalone mode is emulated in JS (`matchMedia` and `navigator.standalone`), which is how the
  app detects it; Chromium can't emulate `display-mode` itself.
- Data you create lives until the next start without `--keep`.
- Kill the server by pid from `ps`; `pkill -f "next dev"` also kills the shell running it.
- Outside the cloud container, install a browser once with `npx playwright install chromium`,
  and have Postgres 16 installed (or set `PG_BIN`, or `DEV_DATABASE_URL` to a local throwaway
  database).

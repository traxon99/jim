# Agent instructions

**Before any change merges, check the diff against the pre-ship checklist in
[`docs/LESSONS.md`](docs/LESSONS.md).** Each line is a bug that already reached the user's phone.
In auto-ship a review subagent does this pass; otherwise do it yourself. When you fix a bug, add a
row to [`docs/LESSONS-LEDGER.md`](docs/LESSONS-LEDGER.md) in the same PR.

Also read, when they apply:

- `docs/PWA.md`: before building or changing any screen, overlay, popup or input.
- `docs/ARCHITECTURE.md` and `docs/DECISIONS.md`: local-first IndexedDB, append-only sets,
  foreground-driven sync.

Run `pnpm lint`, `pnpm typecheck` and `pnpm test` before pushing. To see a UI change in the real
signed-in app, use the `run-app` skill (`pnpm dev:stack`).

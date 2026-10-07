# Agent instructions

**Before you ship any change (commit, push, open a PR, or run auto-ship), read
[`docs/LESSONS.md`](docs/LESSONS.md) and go through its pre-ship checklist against your diff.** It
lists the bugs that have already reached the user's phone and the rule that prevents each one.
When you fix a bug, add a row to its ledger in the same PR.

Also read, when they apply:

- `docs/PWA.md`: before building or changing any screen, overlay, popup or input.
- `docs/ARCHITECTURE.md` and `docs/DECISIONS.md`: local-first IndexedDB, append-only sets,
  foreground-driven sync.

Run `pnpm lint`, `pnpm typecheck` and `pnpm test` before pushing.

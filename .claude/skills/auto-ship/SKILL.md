---
name: auto-ship
description: End-to-end feature delivery for this repo — implement the requested change, verify it, document the result (a screenshot for anything UI-facing, a short written summary otherwise), open a PR, babysit that PR until CI and review checks are green, and merge it without waiting for a separate go-ahead. Use this whenever the user asks to "ship", "auto-ship", "just get this done", "build and merge", or otherwise wants a feature taken all the way from idea to merged code in one pass, not just to a diff or an open PR. Don't use it for exploratory changes, questions, or anything the user wants to review before it goes out — this skill's whole point is closing the loop unattended, so only reach for it when the user actually wants that.
---

# Auto-ship

This repo is a personal, single-maintainer project — there's no separate reviewer waiting on
these PRs. That's what makes "implement it and merge it" a reasonable ask here: the user *is*
the review, and they're asking for it up front instead of one PR comment at a time. Treat that
trust as real but scoped — it covers the feature branch and PR this run creates, not other
branches, other PRs, or repo settings.

The loop has five stages. Don't skip the verification or documentation stages to get to green
faster — a fast merge of something broken or undocumented isn't a win.

## 1. Branch

If this session already has a designated feature branch (the environment's "Git Development
Branch Requirements" section names one), use it. Otherwise create a new branch off the current
default branch, named for the feature (`feat/<short-slug>`, matching whatever convention
`git log --oneline -20` shows is already in use).

## 2. Implement

Build the feature. Standard engineering judgment applies here — same as any other task: keep the
diff scoped to what was asked, follow the patterns already in the surrounding code (this repo's
`AGENTS.md`/`CLAUDE.md` and `docs/ARCHITECTURE.md`/`docs/DECISIONS.md` explain the load-bearing
conventions — local-first IndexedDB, append-only sets, foreground-driven sync — don't fight them),
and add or update tests where the change touches logic worth locking down (`packages/core`,
`lib/sync`, `lib/db`, `lib/history` all have existing test suites to extend as a model).

## 3. Verify locally

Before anything gets pushed, run what CI would run so a red check is a surprise, not the
expected outcome:

```
pnpm lint
pnpm typecheck
pnpm test
```

Fix failures here rather than discovering them after opening the PR — a local red run is cheap to
fix, a CI red run costs a round trip.

## 4. Document the result

This is what makes the PR readable to someone (including future-you) who wasn't watching this
session:

- **UI-facing change** (anything under `app/`, `components/`, visible styling, a new screen or
  interaction): use the `run` skill to launch the dev server and actually exercise the feature in
  a browser — this repo targets iPhone 16, so drive it at that viewport (~393×852) rather than
  desktop width. Capture a screenshot of the new/changed state. Send it to the user directly (it's
  the fastest way for them to see what shipped without leaving the conversation), and also commit
  it into the branch under `docs/pr-screenshots/<slug>/` so it can be embedded in the PR body via
  `https://github.com/<owner>/<repo>/blob/<branch>/<path>?raw=true` — that's what makes it render
  inline on GitHub, not just in this session.
- **Non-UI change** (API routes, sync engine, schema, pure logic, MCP server): skip the
  screenshot — there's nothing to look at — and instead write a few sentences for the PR body
  covering what changed, why, and how it was verified (which commands ran, what they confirmed).
  Terse and factual beats padded; this is a changelog entry, not marketing copy.

## 5. Open the PR

Commit, push, and open the PR. Check for a PR template first (per the harness's standing PR
instructions) and populate it; if there's none, structure the body as Summary / Verification /
Screenshot (when there is one). This is also where the documentation from step 4 lands — embed
the screenshot or the written verification summary in the body, don't leave it only in chat.

## 6. Babysit to green, then merge — don't stop at "opened"

Subscribe to the PR's activity. From here, the harness's own PR-driving rules (merge conflicts,
CI red, review-bot findings) already cover *how* to get a PR green — follow those as given, don't
re-derive them. The one thing this skill changes from that default posture: once the PR is
genuinely green (CI passing, no merge conflict, no open blocking finding) and mergeable, **merge
it** — don't leave it "waiting on review" the way an unattended PR normally would. That's the
explicit point of this skill: the user asked for shipped, not opened.

Concretely:
- If the platform supports auto-merge (GitHub does), enable it right after opening the PR so it
  merges the moment checks clear, and keep babysitting in the meantime.
- If auto-merge isn't available, merge manually as soon as the PR is confirmed green.
- Use the merge method (squash/merge/rebase) this repo already favors if there's a discernible
  convention; default to squash if there isn't one, since that keeps history to one commit per
  shipped feature. Delete the branch after merging.
- A required human approval enforced by branch protection is a real wall, not a formality — if
  the merge is refused for that reason, say so plainly and stop; that's not something to route
  around, and it isn't a "just push again" situation.
- Never get to green by skipping, disabling, or loosening a check (deleting a failing test,
  weakening an assertion, force-pushing past a conflict) — a merge bought that way isn't done, it's
  hidden.

## When you're done

Tell the user, in one short message: what shipped, a link to the merged PR, and — for a UI
change — that the screenshot is attached above. If something blocked the loop (a required review,
a failure you couldn't safely resolve, an ambiguous product decision the code itself can't
settle), say exactly what's blocking and where things were left, rather than declaring victory.

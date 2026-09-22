---
name: auto-ship
description: End-to-end feature delivery for this repo, tracked through a GitHub issue — find or create the issue (checking for duplicates first), implement the requested change, verify it, document the result with a short written summary (plus a screenshot when a real browser run is practical), open a PR linked to the issue, babysit that PR until CI and review checks are green, merge it, confirm the change actually deployed, and only then close the issue. Use this whenever the user asks to "ship", "auto-ship", "just get this done", "build and merge", or says "auto-ship <feature>" (e.g. "auto-ship friend feature") to point at a specific feature or existing issue. Don't use it for exploratory changes, questions, or anything the user wants to review before it goes out — this skill's whole point is closing the loop unattended, so only reach for it when the user actually wants that.
---

# Auto-ship

This repo is a personal, single-maintainer project — there's no separate reviewer waiting on
these PRs. That's what makes "implement it and merge it" a reasonable ask here: the user *is*
the review, and they're asking for it up front instead of one PR comment at a time. Treat that
trust as real but scoped — it covers the feature branch and PR this run creates, not other
branches, other PRs, or repo settings.

Every run of this skill is tracked through exactly one GitHub issue in `traxon99/jim`, from before
the first line of code to after the deploy is confirmed. The issue is the record of what was
asked for, what happened, and whether it's actually live — don't treat it as paperwork bolted on
after the fact.

The loop has eight stages. Don't skip the verification, documentation, or deploy-confirmation
stages to get to green faster — a fast merge of something broken, undocumented, or not actually
live isn't a win.

## 1. Find or create the tracking issue

Work out what feature is being asked for from the request (e.g. "auto-ship friend feature" →
"friend[s]"; "auto-ship #35" → issue 35 directly; a bare "ship this" following a fuller
description earlier in the conversation → use that description).

- **An issue number was given directly** — use it (`issue_read` to confirm it exists and is
  open).
- **Otherwise, search before creating anything.** Use `search_issues` (or `list_issues` for a
  small repo like this one) against `traxon99/jim` with keywords from the feature description,
  open issues first. This repo already accumulates issues from two sources — the in-app feedback
  form (labeled `feedback`) and issues filed directly on GitHub — so a matching issue for the
  request often already exists (e.g. a "friend" feature request shows up as an existing "Add
  friends system" issue). Reusing that issue instead of forking a second one for the same feature
  is the point of this check.
  - A clear match among **open** issues → use it.
  - The best match is already **closed** as completed → that feature was likely already shipped.
    Don't silently redo the work; say so and confirm with the user before proceeding.
  - Multiple plausible open matches, or none close enough to be confident → if genuinely
    ambiguous, ask; otherwise create a new issue rather than guessing at the wrong one.
- **No matching issue exists** — create one (`issue_write`, `method: create`) titled from the
  feature request, with a short body describing what was asked for and by whom (the conversation
  that triggered this run). This is a real tracking issue, not a formality — write it the way
  you'd want to find it later.

Whichever path you took, the rest of this run happens against that issue number. Post a comment
on it now (or on creation, in the body) noting that auto-ship is picking this up.

## 2. Check for a linked project

Call `list_issue_fields` for `traxon99/jim`. This tells you whether the repo's issues are wired
into a GitHub Project with custom fields (a `Status` field with options like Todo / In Progress /
In Review / Done is the common shape):

- **Fields exist** — this issue can be moved along the project board via `issue_write`'s
  `issue_fields` (`field_option_name` against the `Status` field, or whatever the project's field
  is actually called). Move it at each stage below instead of narrating the same thing in a
  comment.
- **No fields returned** — there's no project associated. Track progress in the issue's own
  comments instead: one comment per meaningful stage transition (started, PR opened, merged,
  deploy confirmed), not a play-by-play of every command run.

Re-check this at the start of each run rather than assuming last time's answer still holds — a
project may get wired up later.

Move/comment "in progress" now, before branching.

## 3. Branch

If this session already has a designated feature branch (the environment's "Git Development
Branch Requirements" section names one), use it. Otherwise create a new branch off the current
default branch, named for the feature (`feat/<short-slug>`, matching whatever convention
`git log --oneline -20` shows is already in use).

## 4. Implement

Build the feature. Standard engineering judgment applies here — same as any other task: keep the
diff scoped to what was asked, follow the patterns already in the surrounding code (this repo's
`AGENTS.md`/`CLAUDE.md` and `docs/ARCHITECTURE.md`/`docs/DECISIONS.md` explain the load-bearing
conventions — local-first IndexedDB, append-only sets, foreground-driven sync — don't fight them),
and add or update tests where the change touches logic worth locking down (`packages/core`,
`lib/sync`, `lib/db`, `lib/history` all have existing test suites to extend as a model).

## 5. Verify locally

Before anything gets pushed, run what CI would run so a red check is a surprise, not the
expected outcome:

```
pnpm lint
pnpm typecheck
pnpm test
```

Fix failures here rather than discovering them after opening the PR — a local red run is cheap to
fix, a CI red run costs a round trip.

## 6. Document the result

This is what makes the PR readable to someone (including future-you) who wasn't watching this
session. Write a few sentences for the PR body covering what changed, why, and how it was
verified (which commands ran, what they confirmed; for a UI-facing change, note which components/
screens are affected). Terse and factual beats padded; this is a changelog entry, not marketing
copy. A screenshot is not required — this repo's auth-gated backend and lack of a disposable test
environment usually make a real browser run impractical from here — but if the `run` skill can
actually exercise the feature (iPhone 16 viewport, ~393×852) without touching real user data, feel
free to capture one and send it to the user directly.

## 7. Open the PR

Commit, push, and open the PR. Check for a PR template first (per the harness's standing PR
instructions) and populate it; if there's none, structure the body as Summary / Verification. This
is also where the documentation from step 6 lands — embed the written verification summary (and a
screenshot, if one was taken) in the body, don't leave it only in chat.

Reference the tracking issue with a non-closing keyword — **`Refs #NN`** or **`Part of #NN`**, not
`Fixes`/`Closes`/`Resolves`. Those closing keywords would auto-close the issue the moment the PR
merges, before deployment is confirmed, which is exactly the premature close step 9 exists to
prevent. Comment on the issue with the PR link, and move it to "in review" (project field or
comment, per step 2).

## 8. Babysit to green, then merge — don't stop at "opened"

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

Once merged, comment on the issue that it's merged (with the PR link) and move it to whatever the
project's "merged/deploying" state is, if one exists — **do not close it yet.** This repo has no
GitHub Actions CI; the merge itself proves nothing about production. Deployment (step 9) is a
separate, required condition for closing.

## 9. Confirm the deploy — merged is not the same as shipped

This repo deploys to Vercel on push to `main` (`docs/DECISIONS.md` ADR-004). Before closing the
issue, confirm the merge commit actually deployed *successfully*, not just that it merged:

- Look for a deployment signal on the merge commit — a check run or a bot comment from Vercel
  reporting the production deployment's outcome. If one arrives (via the PR/webhook subscription
  or by checking the commit directly) and it's green, that's your confirmation.
- If it's red, this is CI-red-equivalent work, not a stopping point: diagnose the production build
  failure, fix it on a new branch/PR off `main` (the previous PR is already merged and closed),
  and repeat steps 7–9 for the fix. Comment on the issue explaining what broke and that a fix is
  in flight.
- If no deployment signal is observable through the tools available in this session (no check run
  arrives, commit-status reads are blocked), don't guess or assume success. Say so plainly in an
  issue comment — code is merged, deployment status could not be automatically confirmed — and
  either verify by another means available to you (e.g. checking the production app directly if
  you have a way to reach it) or ask the user to confirm the deploy before you close the issue.
  Closing on an unconfirmed assumption defeats the entire point of this stage.

## 10. Close the issue

Only once the code is merged **and** the deploy is confirmed successful: move the issue to its
project's "done" state (if a project is linked) and close it (`issue_write`, `state: closed`,
`state_reason: completed`), with a final comment linking the merged PR and stating the deploy was
confirmed. If the issue was reused from an existing report (feedback-filed or otherwise), that
comment is also the natural place to note it shipped.

## When you're done

Tell the user, in one short message: what shipped and the issue and PR it went through (numbers +
links). If something blocked the loop (a required review, a failure you couldn't safely resolve,
an unconfirmed deploy, an ambiguous product decision the code itself can't settle), say exactly
what's blocking and where things — and the issue — were left, rather than declaring victory.

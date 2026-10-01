---
name: auto-ship
description: End-to-end feature delivery for this repo, tracked through a GitHub issue — find or create the issue (checking for duplicates first), implement the requested change, verify it, document the result with a short written summary (plus a screenshot when a real browser run is practical), open a PR that closes the issue with a closing keyword (so GitHub links them in the Development panel), babysit that PR until CI and review checks are green, and merge it — the issue auto-closes with the merge. Use this whenever the user asks to "ship", "auto-ship", "just get this done", "build and merge", or says "auto-ship <feature>" (e.g. "auto-ship friend feature") to point at a specific feature or existing issue. Don't use it for exploratory changes, questions, or anything the user wants to review before it goes out — this skill's whole point is closing the loop unattended, so only reach for it when the user actually wants that.
---

# Auto-ship

This repo is a personal, single-maintainer project — there's no separate reviewer waiting on
these PRs. That's what makes "implement it and merge it" a reasonable ask here: the user *is*
the review, and they're asking for it up front instead of one PR comment at a time. Treat that
trust as real but scoped — it covers the feature branch and PR this run creates, not other
branches, other PRs, or repo settings.

Every run of this skill is tracked through exactly one GitHub issue in `traxon99/jim`, from before
the first line of code to the merge. The issue is the record of what was asked for and what
happened — don't treat it as paperwork bolted on after the fact.

Don't skip the verification or documentation stages to get to green faster — a fast merge of
something broken or undocumented isn't a win. The run ends with the code merged, CI green, and the
issue **auto-closed by the merge** (step 8 explains the tradeoff this means accepting). Don't wait
on or try to confirm the Vercel deploy.

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
  comments instead: one comment per meaningful stage transition (started, PR opened, merged and
  in review), not a play-by-play of every command run.

Re-check this at the start of each run rather than assuming last time's answer still holds — a
project may get wired up later.

Move/comment "in progress" now, before branching.

## 3. Branch

If this session already has a designated feature branch (the environment's "Git Development
Branch Requirements" section names one), use it. Otherwise create a new branch off the current
default branch, named for the feature (`feat/<short-slug>`, matching whatever convention
`git log --oneline -20` shows is already in use).

## 4. Implement

**First, read `docs/LESSONS.md` in full** — every run, not just the first. It's the ledger of bugs
that already shipped and the pre-ship checklist that prevents them, and it changes as fixes land.
Keep its checklist in mind while building, not only at the end.

Build the feature. Standard engineering judgment applies here — same as any other task: keep the
diff scoped to what was asked, follow the patterns already in the surrounding code (this repo's
`AGENTS.md`/`CLAUDE.md` and `docs/ARCHITECTURE.md`/`docs/DECISIONS.md` explain the load-bearing
conventions — local-first IndexedDB, append-only sets, foreground-driven sync — don't fight them),
and add or update tests where the change touches logic worth locking down (`packages/core`,
`lib/sync`, `lib/db`, `lib/history` all have existing test suites to extend as a model).

## 5. Verify locally

Go through the `docs/LESSONS.md` pre-ship checklist against your actual diff, item by item for
everything it touches, and fix what it catches. **If this run fixes a bug, add a row to the top of
that file's ledger** (issue/PR, what broke, cause, rule), and add the rule to the checklist (and to
`docs/PWA.md` for layout/iOS lessons) if it isn't covered yet. That's how the next run avoids
shipping the same bug.

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

## 7. Update the release note

`apps/web/lib/pwa/notifications.ts` exports `LATEST_RELEASE_NOTE`, the body of the "Jim updated"
push notification the service worker fires on every deploy (`components/register-service-worker.tsx`).
It's a hand-written constant, not derived from commit history, so it goes stale — and because the
service worker's precache manifest is rebuilt on every build (`scripts/generate-sw.mjs`), *every*
merge to `main` re-fires that notification, stale text and all, whether or not this run touched it.

Update `LATEST_RELEASE_NOTE` to describe what this run is shipping, in the same commit as the
feature change. Keep it one short sentence, user-facing (what changed for them, not implementation
detail), and phrased the way the rest of the file's notification copy reads. Skip this only for a
change with nothing a user would notice (an internal refactor, a test-only change, dependency
bumps) — everything else updates it.

## 8. Open the PR

Commit, push, and open the PR. Check for a PR template first (per the harness's standing PR
instructions) and populate it; if there's none, structure the body as Summary / Verification. This
is also where the documentation from step 6 lands (tick the template's "Lessons check" boxes
only for what you actually checked) — embed the written verification summary (and a
screenshot, if one was taken) in the body, don't leave it only in chat.

Reference the tracking issue with a closing keyword — **`Fixes #NN`** (`Closes #NN` / `Resolves #NN`
work the same) — in the PR body. This is a deliberate tradeoff: a closing keyword is what makes
GitHub add the PR to the issue's **Development** panel (the actual linked-issue box, not just a
text cross-reference) — but it also means the issue closes automatically the instant the PR merges.
There's no open "In review" window afterward for the user to check the change live before it closes;
that check now happens after the fact, and reopening the issue is how they flag it if something's
wrong. Comment on the issue with the PR link before merging; leave it in "In progress" — closing
happens automatically with the merge (step 9), not as a separate action here.

## 9. Babysit to green, then merge — don't stop at "opened"

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

## 10. Confirm the auto-close

The closing keyword from step 8 means GitHub closes the tracking issue itself the moment the merge
lands — there's no separate status move to make here. Once the PR is merged **and** CI is green on
the merged head, confirm the issue actually closed (`issue_read`) and, if the project has custom
fields (step 2), set its `Status` to **Done** — GitHub's auto-close doesn't touch project fields, so
that part is still yours to do. If this repo's `In review`-style label convention is in play instead,
drop that label on the now-closed issue (closed issues in this repo don't carry it) rather than
leaving it stuck mid-flow.

- **Don't wait for or try to confirm the deploy.** Vercel deploys `main` on its own
  (`docs/DECISIONS.md` ADR-004); checking that the change is live is the user's review, not this
  skill's job — it now happens after the issue is already closed rather than before.
- If checks on the merged head come back red, that's still work: fix it on a new branch/PR off
  `main` (the previous PR is already merged), repeat steps 7–10 for the fix. The original issue is
  already closed by then — reopen it for the fix if it's the same bug reappearing, or open a fresh
  issue if it's better tracked separately.

## When you're done

Tell the user, in one short message: what merged, the issue and PR it went through (numbers +
links), and that the issue closed automatically with the merge — so it's on them to flag it (by
reopening the issue) if checking it live turns up a problem. If something blocked the loop (a
required review, a failure you couldn't safely resolve, an ambiguous product decision the code
itself can't settle), say exactly what's blocking and where things — and the issue — were left,
rather than declaring victory.

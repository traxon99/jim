---
name: issue-clean-up
description: Sweeps open GitHub issues in traxon99/jim for likely duplicates and, only after the user confirms each proposed group, closes the non-canonical issue(s) as duplicates (state_reason "duplicate", linked via duplicate_of) with a comment pointing to the canonical issue. This repo collects issues from two sources — the in-app feedback form (label "feedback") and issues filed directly on GitHub — so the same request often shows up twice with slightly different wording, which is exactly the pattern this skill hunts for. Use this whenever the user asks to "clean up issues", "dedupe issues", "find duplicate issues", "tidy the issue tracker", or "sweep for duplicates" in this repo. Never triggers on its own and never closes anything without an explicit per-group confirmation — it proposes, the user decides.
---

# Issue clean-up

Like `auto-ship`, this is scoped to `traxon99/jim` — a personal, single-maintainer repo where the
user is the only reviewer that matters. But closing an issue is a one-way door in a way that
opening a PR isn't (a closed issue is easy to miss reopening, and "duplicate" is a judgment call a
title-and-labels sweep can get wrong), so this skill never merges its own read on "these look like
the same thing" straight into an action. It proposes each group, the user says yes or no, and only
a yes closes anything.

## 1. Gather the open issues

Pull every open issue in `traxon99/jim` (`list_issues`, `state: OPEN`, with `title`, `body`,
`labels`, `created_at`, `comments` — a small repo like this one doesn't need pagination). For each
one that looks likely to have prior history worth checking, `issue_read` (`method: get`) it for
`closed_by_pull_requests` — that tells you whether a PR is already wired to close it, which matters
in step 3.

Skip anything already closed; this skill only ever acts on open issues.

## 2. Group likely duplicates

Read the titles and bodies and group issues that describe the same underlying request. The
giveaway pattern in this repo: one issue filed straight on GitHub and another auto-filed from the
in-app feedback form (labeled `feedback`) describing the same feature or bug in different words —
e.g. "Add a way to compare workouts with friends" and "friends system workout tracking for
friends" are the same ask wearing two different sentences. Titles matching exactly is the easy
case; the harder, more valuable case is semantic overlap despite different wording, so actually
read the bodies rather than just diffing titles.

Don't group on topic alone — "add rest timer sound options" and "rest timer doesn't reset between
sets" are both about the rest timer but are not the same issue (one's a feature request, one's a
bug). The bar is "closing one and pointing at the other would lose nothing," not "these are
related."

For each group, pick the canonical issue to keep open — usually the oldest (`created_at`), but
prefer one with a more complete body, existing comments/discussion, or (per step 1) a PR already
linked to it over an otherwise-identical but threadbare duplicate. This is a recommendation you'll
show the user, not a decision you make for them.

**Before proposing a group, check for a prior "not a duplicate" verdict.** If you (a previous run
of this skill) already asked about this pairing and the user said no, there's a comment on one of
the issues starting with `issue-clean-up:` recording that. Skip a group whose issues already carry
one of these comments against each other — re-asking about a pairing the user already declined is
the annoying kind of unhelpful.

## 3. Flag, don't fold in, issues with active work

An issue with a PR already linked to it (`closed_by_pull_requests` from step 1 showing a real
entry, or — since `auto-ship` deliberately links PRs with a non-closing `Refs #NN` rather than
`Fixes #NN`, see its own SKILL.md — a comment on the issue containing a PR link) is mid-flight, not
a stale duplicate waiting to be tidied away. If such an issue is the *canonical* one in a group,
that's fine and expected. If it's the one your grouping would otherwise close as the duplicate,
don't fold it in with the others — call it out to the user separately and let them decide, rather
than quietly proposing to close in-progress work.

## 4. Ask before closing anything

For each remaining candidate group, ask the user with `AskUserQuestion` — one question per group,
batched up to four per call. Show the issue numbers, titles, and a one-line reason they look like
duplicates, and name your recommended canonical issue. Offer options along the lines of:

- **Close the others as duplicates of #NN (recommended)** — your suggested canonical
- **Keep a different one as canonical** — let the user name which, via free text
- **Not duplicates — leave both open**

Never batch-close a group the user hasn't individually confirmed, and never treat silence or a
generic "looks good, go ahead" for one group as consent for a different one — confirm each group on
its own terms, since "these two are the same" is exactly the kind of call that's obvious to you and
wrong often enough to be worth the extra question.

## 5. Act on the answers

For each group the user confirmed:

- Close each non-canonical issue with `issue_write` (`state: closed`, `state_reason: duplicate`,
  `duplicate_of: <canonical issue number>`) — this is GitHub's actual structured duplicate link,
  not just a state change, so it shows up as "closed as duplicate of #NN" rather than a bare close.
- Comment on the closed issue linking to the canonical one, so anyone landing on it later
  (including future you) doesn't have to reconstruct why it was closed from the state alone.
- Comment on the canonical issue noting it absorbed a duplicate — worth doing even briefly, since a
  feature getting reported twice (once via the feedback form, once filed directly) is itself a
  signal about how much someone wants it.

For each group the user declined: post a short comment on the issues involved starting with
`issue-clean-up:` recording the "not a duplicate" verdict (per step 2, this is what keeps a future
run from re-asking about the same pairing). Don't touch the issue's state.

If a linked GitHub Project exists (`list_issue_fields` for `traxon99/jim`, same check `auto-ship`
does), move a closed-as-duplicate issue to whatever "done"/closed state the board uses; skip this
if no project is linked.

## When you're done

Tell the user, in one short message: how many open issues you swept, how many candidate groups you
found, and for each — closed as a duplicate of which issue, or left open because the user said no.
If you flagged any in-progress issues per step 3 that you didn't fold into a group, say which ones
and why, so the user knows they weren't silently skipped.

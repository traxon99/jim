"use client";

import { LoadingText } from "@/components/loading-text";
import {
  fetchFriendPosts,
  fetchFriendWorkouts,
  fetchReceivedReactions,
  toggleReaction,
} from "@/lib/friends/client";
import { type FeedItem, buildFeed } from "@/lib/friends/feed";
import { pickReaction, settleReaction, summarizeComments } from "@/lib/friends/format";
import type {
  CommentTarget,
  FeedComment,
  FriendPost,
  FriendWorkout,
  ReceivedReaction,
  WorkoutReaction,
} from "@/lib/friends/types";
import { REACTION_EMOJI, REACTION_LABELS, type ReactionKind } from "@jim/core";
import { UserPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FeedPost } from "./feed-post";

type Load =
  | { status: "loading" }
  | { status: "error"; error: string }
  | {
      status: "ready";
      workouts: FriendWorkout[];
      posts: FriendPost[];
      received: ReceivedReaction[];
    };

const SECTION_HEADING =
  "text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500";

/** How many of the latest reactions to your own workouts Home lists. */
const RECEIVED_SHOWN = 5;

/**
 * The social half of Home (issue #35), below your own summary: friends'
 * finished workouts to react to (issue #303) and the posts they've shared
 * (issue #316) as one feed, and who reacted to yours.
 * Finding and managing friends lives on the Friends page. Server data, not
 * IndexedDB — it refreshes whenever the app comes back to the foreground.
 */
export function FriendsFeed({ hasFriends }: { hasFriends: boolean }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [workouts, posts, received] = await Promise.all([
      fetchFriendWorkouts(undefined),
      fetchFriendPosts(undefined),
      fetchReceivedReactions(),
    ]);
    if (!workouts.ok) {
      setLoad((current) =>
        current.status === "ready" ? current : { status: "error", error: workouts.error },
      );
      return;
    }
    setLoad({
      status: "ready",
      workouts: workouts.value,
      posts: posts.ok ? posts.value : [],
      received: received.ok ? received.value : [],
    });
  }, []);

  useEffect(() => {
    void refresh();
    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  function setReactions(
    target: CommentTarget,
    update: (reactions: WorkoutReaction[]) => WorkoutReaction[],
  ) {
    setLoad((current) =>
      current.status === "ready"
        ? {
            ...current,
            workouts: current.workouts.map((w) =>
              "sessionId" in target && w.sessionId === target.sessionId
                ? { ...w, reactions: update(w.reactions) }
                : w,
            ),
            posts: current.posts.map((p) =>
              ("sessionId" in target && p.sessionId === target.sessionId) ||
              ("postId" in target && p.postId === target.postId)
                ? { ...p, reactions: update(p.reactions) }
                : p,
            ),
          }
        : current,
    );
  }

  function setComments(target: CommentTarget, comments: FeedComment[]) {
    const summary = summarizeComments(comments);
    setLoad((current) =>
      current.status === "ready"
        ? {
            ...current,
            workouts: current.workouts.map((w) =>
              "sessionId" in target && w.sessionId === target.sessionId
                ? { ...w, comments: summary }
                : w,
            ),
            posts: current.posts.map((p) =>
              ("sessionId" in target && p.sessionId === target.sessionId) ||
              ("postId" in target && p.postId === target.postId)
                ? { ...p, comments: summary }
                : p,
            ),
          }
        : current,
    );
  }

  async function react(target: CommentTarget, current: WorkoutReaction[], kind: ReactionKind) {
    const before = current;
    setActionError(null);
    setReactions(target, () => pickReaction(before, kind));
    const result = await toggleReaction(target, kind);
    if (result.ok) {
      setReactions(target, () => settleReaction(before, kind, result.value));
    } else {
      setReactions(target, () => before);
      setActionError(result.error);
    }
  }

  if (load.status === "loading") {
    return <LoadingText className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-500" />;
  }
  if (load.status === "error") {
    return (
      <section className="flex w-full flex-col items-center gap-3 py-6">
        <p className="allow-pwa-select text-sm text-zinc-600 dark:text-zinc-400">{load.error}</p>
        <button
          type="button"
          onClick={() => {
            setLoad({ status: "loading" });
            void refresh();
          }}
          className="min-h-11 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-950"
        >
          Try again
        </button>
      </section>
    );
  }

  const feed = buildFeed(load.workouts, load.posts);

  return (
    <div className="route-fade flex flex-col gap-5">
      {actionError && (
        <p className="allow-pwa-select px-4 text-xs text-red-600 dark:text-red-500">
          {actionError}
        </p>
      )}

      {load.received.length > 0 && (
        <section className="flex flex-col gap-2 px-4">
          <h2 className={SECTION_HEADING}>Reactions to your workouts</h2>
          <ul className="flex flex-col gap-2 rounded-lg bg-white p-3 dark:bg-zinc-950">
            {load.received.slice(0, RECEIVED_SHOWN).map((reaction) => (
              <ReceivedReactionRow
                key={`${reaction.sessionId}:${reaction.userId}:${reaction.kind}`}
                reaction={reaction}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="friends-activity" className="flex flex-col gap-3">
        <h2 id="friends-activity" className="px-4 text-2xl font-semibold tracking-tight">
          Friends&apos; activity
        </h2>
        {feed.length === 0 ? (
          <div className="mx-4 flex flex-col items-center gap-3 rounded-lg bg-white px-4 py-6 text-center dark:bg-zinc-950">
            <UsersRound
              className="h-8 w-8 text-zinc-400 dark:text-zinc-600"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {hasFriends
                ? "Your friends' workouts and posts will show up here."
                : "Add a friend to see their workouts and posts here."}
            </p>
            {!hasFriends && (
              <Link
                href="/friends"
                data-ripple
                className="flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground"
              >
                <UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Find friends
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {feed.map((item) => (
              <FeedPost key={feedKey(item)} item={item} onReact={react} onComments={setComments} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function ReceivedReactionRow({ reaction }: { reaction: ReceivedReaction }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="text-lg leading-none" aria-hidden="true">
        {REACTION_EMOJI[reaction.kind]}
      </span>
      <span className="allow-pwa-select min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-300">
        <span className="font-medium text-zinc-950 dark:text-zinc-50">@{reaction.username}</span>
        <span className="sr-only"> reacted {REACTION_LABELS[reaction.kind]}</span> to{" "}
        {reaction.sessionName ?? "your workout"}
      </span>
      <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-500">
        {shortDate(reaction.startedAt)}
      </span>
    </li>
  );
}

function feedKey(item: FeedItem): string {
  return item.type === "workout" ? `w:${item.workout.sessionId}` : `p:${item.post.postId}`;
}

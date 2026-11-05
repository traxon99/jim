"use client";

import { Avatar } from "@/components/friends/avatar";
import { CommentsSheet } from "@/components/friends/comments-sheet";
import { POST_KIND_ICONS } from "@/components/friends/post-kind-icons";
import { ReactButton } from "@/components/friends/reaction-picker";
import type { FeedItem } from "@/lib/friends/feed";
import { myReaction, reactionSummary, workoutMinutes } from "@/lib/friends/format";
import {
  exerciseLine,
  formatVolume,
  recordLines,
  recordsByExercise,
  routineDot,
  splitRecordDetail,
  timeAgo,
  workoutHeaderLine,
  workoutSets,
} from "@/lib/friends/post-media";
import { postShareText, shareText } from "@/lib/friends/share-post";
import type {
  CommentSummary,
  CommentTarget,
  FeedComment,
  FriendPost,
  FriendWorkout,
  WorkoutReaction,
} from "@/lib/friends/types";
import { REACTION_EMOJI, type ReactionKind } from "@jim/core";
import { type LucideIcon, MessageCircle, Send, Trophy } from "lucide-react";
import Link from "next/link";
import { type MouseEvent, type ReactNode, useCallback, useRef, useState } from "react";

export type OnReact = (
  target: CommentTarget,
  current: WorkoutReaction[],
  kind: ReactionKind,
) => void;

/** A thread's comments after the sheet loaded or changed them (issue #749). */
export type OnComments = (target: CommentTarget, comments: FeedComment[]) => void;

/**
 * One post in Home's feed (issue #747, simplified in #770): a header with who
 * and when, a compact summary of the workout with badges for what stood out
 * (PRs, achievements) and its top exercises, then the reactions and comments.
 */
export function FeedPost({
  item,
  onReact,
  onComments,
}: {
  item: FeedItem;
  onReact: OnReact;
  onComments: OnComments;
}) {
  if (item.type === "workout") {
    const { workout } = item;
    return (
      <PostFrame
        scrollId={workout.sessionId}
        username={workout.username}
        avatar={workout.avatar}
        subtitle={workoutHeaderLine(workout)}
        body={<WorkoutBody workout={workout} caption={item.post?.caption ?? null} />}
        reactions={workout.reactions}
        reactedBy={workout.reactedBy}
        shareItem={item}
        onReact={(kind) => onReact({ sessionId: workout.sessionId }, workout.reactions, kind)}
        commentTarget={{ sessionId: workout.sessionId }}
        comments={workout.comments}
        onComments={onComments}
      />
    );
  }

  const { post } = item;
  const sessionId = post.sessionId;
  const reactTarget: CommentTarget = sessionId ? { sessionId } : { postId: post.postId };
  return (
    <PostFrame
      scrollId={sessionId}
      username={post.username}
      avatar={post.avatar}
      subtitle={`${POST_KIND_LABELS[post.kind]} · ${timeAgo(post.createdAt)}`}
      body={<PostBody post={post} />}
      reactions={post.reactions}
      reactedBy={post.reactedBy}
      shareItem={item}
      onReact={(kind) => onReact(reactTarget, post.reactions, kind)}
      // A workout post's comments are its workout's (issue #749).
      commentTarget={reactTarget}
      comments={post.comments}
      onComments={onComments}
    />
  );
}

/** Two taps on a post's summary this close together heart it. */
const DOUBLE_TAP_MS = 300;

const POST_KIND_LABELS: Record<FriendPost["kind"], string> = {
  workout: "Finished a workout",
  record: "New personal record",
  achievement: "Earned an achievement",
};

function PostFrame({
  scrollId,
  username,
  avatar,
  subtitle,
  body,
  reactions,
  reactedBy,
  shareItem,
  onReact,
  commentTarget,
  comments,
  onComments,
}: {
  scrollId: string | null;
  username: string;
  avatar: string | null;
  subtitle: string;
  body: ReactNode;
  reactions: WorkoutReaction[];
  reactedBy: string[];
  shareItem: FeedItem;
  onReact: (kind: ReactionKind) => void;
  commentTarget: CommentTarget;
  comments: CommentSummary;
  onComments: OnComments;
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const summary = reactionSummary(reactions, reactedBy);

  async function handleShare() {
    const { title, text } = postShareText(shareItem);
    if ((await shareText(title, text)) === "copied") {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  }

  function pick(kind: ReactionKind) {
    setPickerOpen(false);
    onReact(kind);
  }
  const closePicker = useCallback(() => setPickerOpen(false), []);

  // Double-tap the summary to heart it, like a photo feed. It only ever adds
  // a heart (a second double-tap doesn't take it back); the React button does.
  const lastTap = useRef(0);
  const [hearts, setHearts] = useState(0);
  function handleBodyTap(event: MouseEvent<HTMLDivElement>) {
    // Taps on the summary's own buttons ("+2 more") aren't half a double-tap.
    if (event.target instanceof Element && event.target.closest("button")) return;
    const now = Date.now();
    if (now - lastTap.current > DOUBLE_TAP_MS) {
      lastTap.current = now;
      return;
    }
    lastTap.current = 0;
    setHearts((n) => n + 1);
    if (myReaction(reactions) !== "heart") onReact("heart");
  }

  return (
    <article
      id={scrollId ? `feed-session-${scrollId}` : undefined}
      className="flex flex-col bg-white pb-5 dark:bg-zinc-950"
    >
      <header className="flex items-center gap-3 px-4 py-3">
        <Link href={`/friends/${username}`} data-ripple className="shrink-0">
          <Avatar username={username} avatar={avatar} />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <Link
            href={`/friends/${username}`}
            data-ripple
            className="allow-pwa-select truncate text-base font-semibold"
          >
            {username}
          </Link>
          <span className="allow-pwa-select truncate text-sm text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </span>
        </div>
      </header>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: a double-tap shortcut; the React button is the accessible way to heart a post */}
      <div
        className="relative touch-manipulation"
        onClick={handleBodyTap}
        // A double-click would otherwise select the summary's text.
        onMouseDown={(event) => {
          if (event.detail > 1) event.preventDefault();
        }}
      >
        {body}
        {hearts > 0 && (
          <span
            key={hearts}
            aria-hidden="true"
            className="heart-burst pointer-events-none absolute inset-0 flex items-center justify-center text-[80px] leading-none"
          >
            {REACTION_EMOJI.heart}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5 px-2 pt-2">
        <div className="flex items-center gap-1">
          <ReactButton
            reactions={reactions}
            pickerOpen={pickerOpen}
            onOpenPicker={() => setPickerOpen((open) => !open)}
            onClosePicker={closePicker}
            onPick={pick}
          />
          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            aria-label={comments.count > 0 ? `Comments, ${comments.count}` : "Comment"}
            className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2 text-sm text-zinc-700 dark:text-zinc-300"
          >
            <MessageCircle className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            {comments.count > 0 && <span className="tabular-nums">{comments.count}</span>}
          </button>
          <button
            type="button"
            onClick={() => void handleShare()}
            aria-label={shareCopied ? "Copied" : "Share"}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full px-2 text-sm text-zinc-700 dark:text-zinc-300"
          >
            <Send className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
          </button>
          {shareCopied && (
            <output className="ml-auto pr-2 text-xs text-zinc-500 dark:text-zinc-400">
              Copied
            </output>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 px-4">
        {summary && (
          <p className="flex min-w-0 items-center gap-2 text-sm">
            <span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
              {summary.kinds.map((kind) => (
                <span
                  key={kind}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-xs ring-2 ring-white dark:bg-zinc-800 dark:ring-zinc-950"
                >
                  {REACTION_EMOJI[kind]}
                </span>
              ))}
            </span>
            <span className="allow-pwa-select min-w-0 truncate text-zinc-500 dark:text-zinc-400">
              <span className="font-semibold text-zinc-950 dark:text-zinc-50">{summary.names}</span>
              {summary.others && ` ${summary.others}`}
            </span>
          </p>
        )}
        {comments.count > 1 && (
          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            className="self-start text-sm text-zinc-500 dark:text-zinc-400"
          >
            View all {comments.count} comments
          </button>
        )}
        {comments.latest && (
          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            className="allow-pwa-select min-w-0 self-stretch truncate text-left text-sm text-zinc-800 dark:text-zinc-200"
          >
            <span className="font-semibold text-zinc-950 dark:text-zinc-50">
              {comments.latest.username}
            </span>{" "}
            {comments.latest.body}
          </button>
        )}
      </div>
      {commentsOpen && (
        <CommentsSheet
          target={commentTarget}
          ownerUsername={username}
          onClose={() => setCommentsOpen(false)}
          onChange={(list) => onComments(commentTarget, list)}
        />
      )}
    </article>
  );
}

/** How many exercises a post lists before "+N more". */
const EXERCISES_SHOWN = 3;

const BADGE_TONES = {
  pr: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  achievement: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300",
} as const;

/** A pill calling out something that stood out: a PR or an achievement. */
function PostBadge({
  tone,
  icon: Icon,
  children,
}: {
  tone: keyof typeof BADGE_TONES;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full pr-3 pl-2.5 text-sm font-semibold ${BADGE_TONES[tone]}`}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden="true" />
      <span className="truncate">{children}</span>
    </span>
  );
}

function Caption({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="whitespace-pre-line break-words text-[15px] text-zinc-800 dark:text-zinc-200">
      {text}
    </p>
  );
}

/** A finished workout: name, a stats line, PR badge, caption and its top exercises. */
function WorkoutBody({ workout, caption }: { workout: FriendWorkout; caption: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const minutes = workoutMinutes(workout);
  const sets = workoutSets(workout);
  const prs = workout.records.length;
  const records = recordsByExercise(workout.records);
  const shown = expanded ? workout.exercises : workout.exercises.slice(0, EXERCISES_SHOWN);
  const hidden = workout.exercises.length - shown.length;
  return (
    <div className="allow-pwa-select flex min-w-0 flex-col gap-2.5 px-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className="flex min-w-0 items-center gap-2 text-lg font-bold tracking-tight">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${routineDot(workout.routineColor)}`}
            aria-hidden="true"
          />
          <span className="truncate">{workout.name ?? "Workout"}</span>
        </h3>
        <p className="truncate text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
          <Strong>{minutes} min</Strong>
          {sets > 0 && (
            <>
              {" · "}
              <Strong>{sets}</Strong> {sets === 1 ? "set" : "sets"}
            </>
          )}
          {workout.volume !== null && workout.volume > 0 && (
            <>
              {" · "}
              <Strong>{formatVolume(workout.volume)}</Strong> {workout.units}
            </>
          )}
        </p>
      </div>
      {prs > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <PostBadge tone="pr" icon={Trophy}>
            {prs === 1 ? "PR" : `${prs} PRs`}
          </PostBadge>
        </div>
      )}
      <Caption text={caption} />
      {workout.exercises.length > 0 && (
        <ul className="flex flex-col rounded-2xl bg-zinc-100 px-3 dark:bg-zinc-900">
          {shown.map((exercise, index) => {
            const prsHere = records.get(exercise.name) ?? [];
            return (
              <li
                key={`${exercise.name}:${index}`}
                className="flex min-h-9 min-w-0 items-center gap-2 border-zinc-200 py-1.5 text-sm not-first:border-t dark:border-zinc-800"
              >
                <span className="min-w-0 flex-1 truncate">{exercise.name}</span>
                {prsHere.length > 0 && (
                  <span
                    role="img"
                    aria-label={prsHere
                      .map((record) => recordLines(record, workout.units).detail)
                      .join(", ")}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
                  >
                    <Trophy className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                  </span>
                )}
                <span className="shrink-0 text-zinc-500 tabular-nums dark:text-zinc-400">
                  {exerciseLine(exercise, workout.units)}
                </span>
              </li>
            );
          })}
          {hidden > 0 && (
            <li className="border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="flex min-h-11 w-full items-center text-left text-sm text-zinc-500 dark:text-zinc-400"
              >
                +{hidden} more {hidden === 1 ? "exercise" : "exercises"}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-zinc-950 dark:text-zinc-50">{children}</span>;
}

/** A shared record, achievement, or a workout the feed doesn't otherwise carry. */
function PostBody({ post }: { post: FriendPost }) {
  const Icon = POST_KIND_ICONS[post.kind];
  const { label, amount } =
    post.kind === "record"
      ? splitRecordDetail(post.detail)
      : { label: post.detail ?? "", amount: null };
  return (
    <div className="allow-pwa-select flex min-w-0 flex-col gap-2.5 px-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className="break-words text-lg font-bold tracking-tight">{post.title}</h3>
        {(label || amount) && (
          <p className="break-words text-sm text-zinc-500 dark:text-zinc-400">
            {label}
            {label && amount && " · "}
            {amount && <Strong>{amount}</Strong>}
          </p>
        )}
      </div>
      {post.kind !== "workout" && (
        <div className="flex flex-wrap gap-1.5">
          <PostBadge tone={post.kind === "record" ? "pr" : "achievement"} icon={Icon}>
            {post.kind === "record" ? "New PR" : "Achievement"}
          </PostBadge>
        </div>
      )}
      <Caption text={post.caption} />
    </div>
  );
}

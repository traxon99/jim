"use client";

import { Avatar } from "@/components/friends/avatar";
import { CommentBody, useKeyboardInset } from "@/components/friends/comments-sheet";
import { POST_KIND_ICONS } from "@/components/friends/post-kind-icons";
import { ReactButton } from "@/components/friends/reaction-picker";
import { ArrowUp, Bell, ChevronLeft, ChevronRight, UserPlus, X } from "@/components/icons/solar";
import { RoutineIconTile } from "@/components/routines/routine-icon";
import {
  type ActivityGroup,
  dayLabel,
  groupActivity,
  peopleLine,
  reactionTally,
} from "@/lib/friends/activity-groups";
import {
  addComment,
  fetchActivity,
  fetchComments,
  markActivitySeen,
  reactToComment,
  respondToFriendRequest,
} from "@/lib/friends/client";
import { pickReaction, settleReaction } from "@/lib/friends/format";
import { timeAgo } from "@/lib/friends/post-media";
import type { ActivityItem, FeedComment } from "@/lib/friends/types";
import { useFriends } from "@/lib/friends/use-friends";
import { useToday } from "@/lib/pwa/use-today";
import { formatMinutes } from "@/lib/home/stats";
import { type LogGuard, createLogGuard } from "@/lib/workout/log-guard";
import {
  COMMENT_MAX_LENGTH,
  REACTION_EMOJI,
  REACTION_KINDS,
  REACTION_LABELS,
  type ReactionKind,
  commentError,
  normalizeComment,
} from "@jim/core";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Load =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; items: ActivityItem[] };

const ROUND_BUTTON =
  "flex h-11 w-11 items-center justify-center rounded-full text-zinc-500 dark:text-zinc-400";
const ROUND_FILL =
  "flex h-8 w-8 items-center justify-center rounded-full bg-zinc-500/12 dark:bg-zinc-500/24";
const GROUP_LABEL =
  "px-1 pt-4 pb-1.5 text-[13px] font-semibold uppercase tracking-[0.03em] text-zinc-500";

/** "Short" ago without the "ago": "12m", "3h", "2d". */
function shortAgo(iso: string): string {
  return timeAgo(iso).replace(/ ago$/, "");
}

function groupHref(group: ActivityGroup): string {
  return "sessionId" in group.target
    ? `/history/${group.target.sessionId}`
    : `/home?focus=${group.target.postId}`;
}

function groupMeta(group: ActivityGroup, today: Date): string {
  const day = dayLabel(group.at, today);
  if (group.durationMinutes !== null && group.durationMinutes > 0) {
    return `${day} · ${formatMinutes(group.durationMinutes)}`;
  }
  return group.postDetail ? `${day} · ${group.postDetail}` : day;
}

/**
 * The Friends header bell's activity (#753, redesigned in #818): friend
 * requests answered in place, then reactions and comments grouped by the
 * workout or post they're on, New before Earlier. A group opens its own view
 * with every reaction and the comment thread, and a Reply field.
 */
export function ActivitySheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { refresh: refreshFriends } = useFriends();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set());
  const [answering, setAnswering] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const keyboardInset = useKeyboardInset();

  const reload = useCallback(async () => {
    const result = await fetchActivity();
    if (result.ok) {
      setLoad({ status: "ready", items: result.value.items });
      // Marked only after the list loaded, so this open still shows what was new.
      void markActivitySeen();
    } else {
      const { error } = result;
      setLoad((current) => (current.status === "ready" ? current : { status: "error", error }));
    }
  }, []);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (openKey) setOpenKey(null);
      else onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, openKey]);

  // `fixed` doesn't stop the page underneath from scrolling (docs/PWA.md §2).
  useEffect(() => {
    const html = document.documentElement;
    const { body } = document;
    const previous = { html: html.style.overflow, body: body.style.overflow };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = previous.html;
      body.style.overflow = previous.body;
    };
  }, []);

  const sections = useMemo(
    () =>
      load.status === "ready"
        ? groupActivity(load.items.filter((item) => !answered.has(item.id)))
        : null,
    [load, answered],
  );
  const openGroup =
    openKey && sections
      ? ([...sections.fresh, ...sections.earlier].find((g) => g.key === openKey) ?? null)
      : null;

  async function answer(item: ActivityItem, accept: boolean) {
    if (answering) return;
    setAnswering(item.id);
    setRequestError(null);
    try {
      const result = await respondToFriendRequest(item.actorUserId, accept);
      if (!result.ok) {
        setRequestError(result.error);
        return;
      }
      setAnswered((current) => new Set(current).add(item.id));
      void refreshFriends();
    } finally {
      setAnswering(null);
    }
  }

  function navigate(href: string) {
    onClose();
    router.push(href);
  }

  if (!mounted) return null;

  const empty =
    sections !== null &&
    sections.requests.length === 0 &&
    sections.fresh.length === 0 &&
    sections.earlier.length === 0;

  return createPortal(
    // z-30: above the tab bar and FloatingCard (z-20), like the comments sheet.
    <div
      className="sheet-backdrop safe-x fixed inset-0 z-30 flex flex-col justify-end overscroll-none"
      style={{ paddingTop: "max(12px, var(--top-inset))" }}
    >
      <button
        type="button"
        aria-label="Close activity"
        onClick={onClose}
        className="absolute! inset-0 touch-none bg-black/30"
      />
      <section
        aria-label={openGroup ? openGroup.title : "Activity"}
        className={`route-fade relative flex min-h-0 flex-col rounded-t-[22px] bg-background text-zinc-950 shadow-2xl dark:text-zinc-50 ${
          empty ? "" : "h-full"
        }`}
        style={{ marginBottom: keyboardInset }}
      >
        <header className="grid shrink-0 touch-none grid-cols-[44px_1fr_44px] items-center px-3 pt-1.5">
          <span
            aria-hidden="true"
            className="col-span-3 mx-auto mb-1 h-[5px] w-9 rounded-full bg-zinc-300 dark:bg-zinc-700"
          />
          {openGroup ? (
            <button
              type="button"
              aria-label="Back to activity"
              onClick={() => setOpenKey(null)}
              className={ROUND_BUTTON}
            >
              <span className={ROUND_FILL}>
                <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
              </span>
            </button>
          ) : (
            <span />
          )}
          <h2 className="text-center text-[17px] font-semibold tracking-[-0.02em]">
            {openGroup ? "" : "Activity"}
          </h2>
          <button
            type="button"
            aria-label="Close activity"
            onClick={onClose}
            className={`${ROUND_BUTTON} justify-self-end`}
          >
            <span className={ROUND_FILL}>
              <X className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden="true" />
            </span>
          </button>
        </header>

        {openGroup ? (
          <GroupDetail
            key={openGroup.key}
            group={openGroup}
            keyboardOpen={keyboardInset > 0}
            onOpen={() => navigate(groupHref(openGroup))}
          />
        ) : (
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(16px,env(safe-area-inset-bottom))]"
            key="list"
          >
            {load.status === "loading" && (
              <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>
            )}
            {load.status === "error" && (
              <div className="flex flex-col items-center gap-3 py-10">
                <p className="allow-pwa-select text-sm text-zinc-600 dark:text-zinc-400">
                  {load.error}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setLoad({ status: "loading" });
                    void reload();
                  }}
                  className="min-h-11 rounded-full bg-zinc-500/12 px-5 text-sm font-semibold dark:bg-zinc-500/24"
                >
                  Try again
                </button>
              </div>
            )}
            {empty && <EmptyActivity onFindFriends={() => navigate("/friends")} />}
            {sections && sections.requests.length > 0 && (
              <ul className="surface mt-2 flex flex-col divide-y divide-zinc-200 overflow-hidden dark:divide-zinc-800">
                {sections.requests.map((item) => (
                  <RequestRow
                    key={item.id}
                    item={item}
                    busy={answering === item.id}
                    disabled={answering !== null}
                    onAnswer={(accept) => void answer(item, accept)}
                  />
                ))}
              </ul>
            )}
            {requestError && (
              <p className="allow-pwa-select px-1 pt-2 text-xs text-red-600 dark:text-red-500">
                {requestError}
              </p>
            )}
            {sections && sections.fresh.length > 0 && (
              <GroupSection label="New" groups={sections.fresh} onOpen={setOpenKey} />
            )}
            {sections && sections.earlier.length > 0 && (
              <GroupSection label="Earlier" groups={sections.earlier} onOpen={setOpenKey} />
            )}
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}

function EmptyActivity({ onFindFriends }: { onFindFriends: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3.5 px-6 pt-6 pb-10">
      <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-zinc-500/8 text-zinc-400 dark:bg-zinc-500/16 dark:text-zinc-600">
        <Bell className="h-[34px] w-[34px]" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h3 className="text-xl font-bold tracking-[-0.025em]">No activity yet</h3>
      <div aria-hidden="true" className="flex gap-2">
        {(["heart", "fire", "strong", "clap"] as const).map((kind) => (
          <span
            key={kind}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-500/8 text-[22px] opacity-45 grayscale dark:bg-zinc-500/16"
          >
            {REACTION_EMOJI[kind]}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={onFindFriends}
        className="press mt-2.5 flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-base font-semibold text-accent-foreground"
      >
        <UserPlus className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        Add friends
      </button>
    </div>
  );
}

function RequestRow({
  item,
  busy,
  disabled,
  onAnswer,
}: {
  item: ActivityItem;
  busy: boolean;
  disabled: boolean;
  onAnswer: (accept: boolean) => void;
}) {
  return (
    <li className="flex min-w-0 items-center gap-3 py-3 pr-3.5 pl-4">
      <Avatar
        username={item.actorUsername}
        avatar={item.actorAvatar}
        className="h-10 w-10 text-base"
      />
      <span className="min-w-0 flex-1">
        <span className="allow-pwa-select block truncate text-base font-semibold tracking-[-0.02em]">
          {item.actorUsername}
        </span>
        <span className="block text-[13px] text-zinc-500">{shortAgo(item.occurredAt)}</span>
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAnswer(true)}
        aria-label={`Accept ${item.actorUsername}'s friend request`}
        className="press min-h-11 shrink-0 rounded-full px-1 disabled:opacity-60"
      >
        <span className="flex h-8 items-center rounded-full bg-accent px-3.5 text-[15px] font-semibold text-accent-foreground">
          {busy ? "…" : "Accept"}
        </span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAnswer(false)}
        aria-label={`Decline ${item.actorUsername}'s friend request`}
        className="flex h-11 w-9 shrink-0 items-center justify-center disabled:opacity-60"
      >
        <span className={`${ROUND_FILL} text-zinc-500`}>
          <X className="h-[15px] w-[15px]" strokeWidth={2.2} aria-hidden="true" />
        </span>
      </button>
    </li>
  );
}

function GroupSection({
  label,
  groups,
  onOpen,
}: {
  label: string;
  groups: ActivityGroup[];
  onOpen: (key: string) => void;
}) {
  return (
    <section>
      <h3 className={GROUP_LABEL}>{label}</h3>
      <ul className="flex flex-col gap-2.5">
        {groups.map((group) => (
          <li key={group.key}>
            <GroupCard group={group} onOpen={() => onOpen(group.key)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function GroupIcon({ group, size }: { group: ActivityGroup; size: "md" | "lg" }) {
  const box = size === "lg" ? "h-11 w-11 rounded-xl" : "h-[34px] w-[34px] rounded-[10px]";
  if (group.kind !== "workout") {
    const Icon = POST_KIND_ICONS[group.kind];
    return (
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center bg-amber-400/16 text-amber-600 dark:text-amber-300 ${box}`}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
    );
  }
  if (group.routineIcon) {
    return <RoutineIconTile shape={group.routineIcon.shape} color={group.routineIcon.color} />;
  }
  const Icon = POST_KIND_ICONS.workout;
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center bg-zinc-500/12 text-zinc-500 dark:bg-zinc-500/24 ${box}`}
    >
      <Icon className="h-5 w-5" strokeWidth={1.75} />
    </span>
  );
}

function Tally({ group }: { group: ActivityGroup }) {
  const tally = reactionTally(group.reactions, REACTION_KINDS).slice(0, 3);
  return (
    <span className="flex shrink-0 gap-1">
      {tally.map(({ kind, count }) => (
        <span
          key={kind}
          aria-label={`${count} ${REACTION_LABELS[kind]}`}
          className="flex items-center gap-0.5 rounded-full bg-zinc-500/8 py-0.5 pr-2 pl-1.5 text-[13px] font-semibold tabular-nums dark:bg-zinc-500/16"
        >
          <span aria-hidden="true" className="text-sm">
            {REACTION_EMOJI[kind]}
          </span>
          {count}
        </span>
      ))}
    </span>
  );
}

function GroupCard({ group, onOpen }: { group: ActivityGroup; onOpen: () => void }) {
  // Re-renders "Today" into "Yesterday" when iOS resumes the app the next day (#523).
  const today = useToday();
  const people = peopleLine(group.reactions.map((r) => r.actorUsername));
  const faces = group.reactions
    .filter((r, i, all) => all.findIndex((o) => o.actorUserId === r.actorUserId) === i)
    .slice(0, 3);
  const latestComments = group.comments.slice(0, 2);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${group.title}${group.isNew ? ", new" : ""}`}
      className="surface press relative flex w-full flex-col text-left"
    >
      {group.isNew && (
        <span
          aria-hidden="true"
          className="absolute top-[26px] left-1.5 h-[7px] w-[7px] rounded-full bg-accent"
        />
      )}
      <span className="flex w-full min-w-0 items-center gap-3 pt-3 pr-3.5 pl-[18px]">
        <GroupIcon group={group} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold tracking-[-0.02em]">
            {group.title}
          </span>
          <span className="block truncate text-[13px] text-zinc-500">{groupMeta(group, today)}</span>
        </span>
        <ChevronRight
          className="h-[18px] w-[18px] shrink-0 text-zinc-300 dark:text-zinc-600"
          strokeWidth={2}
          aria-hidden="true"
        />
      </span>
      {group.reactions.length > 0 && (
        <span className="flex w-full min-w-0 items-center gap-2.5 pt-3 pr-3.5 pl-[18px]">
          <span className="flex shrink-0" aria-hidden="true">
            {faces.map((face, index) => (
              <span
                key={face.actorUserId}
                className={`rounded-full ring-2 ring-white dark:ring-zinc-900 ${index > 0 ? "-ml-2" : ""}`}
              >
                <Avatar
                  username={face.actorUsername}
                  avatar={face.actorAvatar}
                  className="h-7 w-7 text-xs"
                />
              </span>
            ))}
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px]">
            {people.names.map((name, index) => (
              <span key={name}>
                {index > 0 && (index === people.names.length - 1 && !people.more ? " and " : ", ")}
                <span className="font-semibold">{name}</span>
              </span>
            ))}
            {people.more > 0 && ` +${people.more}`}
          </span>
          <Tally group={group} />
        </span>
      )}
      {latestComments.length > 0 && (
        <>
          <span
            aria-hidden="true"
            className="mt-3 mr-3.5 ml-14 block h-px self-stretch bg-zinc-200 dark:bg-zinc-800"
          />
          <span className="flex w-full flex-col gap-2.5 pt-3 pr-3.5 pl-[18px]">
            {latestComments.map((comment) => (
              <span key={comment.id} className="flex min-w-0 gap-2.5">
                <Avatar
                  username={comment.actorUsername}
                  avatar={comment.actorAvatar}
                  className="h-7 w-7 text-xs"
                />
                <span className="line-clamp-2 min-w-0 flex-1 text-[15px] leading-snug break-words">
                  <span className="font-semibold">{comment.actorUsername}</span>{" "}
                  {comment.commentBody}
                  <span className="ml-1 text-[13px] text-zinc-500">
                    {shortAgo(comment.occurredAt)}
                  </span>
                </span>
              </span>
            ))}
          </span>
        </>
      )}
      <span className="h-3" aria-hidden="true" />
    </button>
  );
}

type Filter = "all" | "comments" | ReactionKind;

type Thread =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; comments: FeedComment[] };

function GroupDetail({
  group,
  keyboardOpen,
  onOpen,
}: {
  group: ActivityGroup;
  keyboardOpen: boolean;
  onOpen: () => void;
}) {
  const today = useToday();
  const [filter, setFilter] = useState<Filter>("all");
  const [thread, setThread] = useState<Thread>({ status: "loading" });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const closePicker = useCallback(() => setPickerFor(null), []);
  const { load: friendsLoad } = useFriends();
  const friendNames = useMemo(
    () =>
      new Set(
        friendsLoad.status === "ready"
          ? friendsLoad.friends.filter((f) => f.status === "accepted").map((f) => f.username)
          : [],
      ),
    [friendsLoad],
  );
  const { target } = group;

  const reloadThread = useCallback(async () => {
    const result = await fetchComments(target);
    if (result.ok) setThread({ status: "ready", comments: result.value });
    else {
      const { error } = result;
      setThread((current) => (current.status === "ready" ? current : { status: "error", error }));
    }
  }, [target]);

  useEffect(() => {
    void reloadThread();
  }, [reloadThread]);

  // A double tap on send posts once: held until the reloaded thread renders (LESSONS #491).
  const postGuard = useRef<LogGuard | null>(null);
  postGuard.current ??= createLogGuard();
  const comments = thread.status === "ready" ? thread.comments : null;
  useEffect(() => {
    if (comments) postGuard.current?.release();
  }, [comments]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = normalizeComment(draft);
    const invalid = commentError(text);
    if (invalid || text === null) {
      setError(invalid);
      return;
    }
    await postGuard.current?.run(async () => {
      setSending(true);
      setError(null);
      try {
        const result = await addComment(target, text);
        if (!result.ok) {
          setError(result.error);
          postGuard.current?.release();
          return;
        }
        setDraft("");
        setFilter((current) => (current === "all" || current === "comments" ? current : "all"));
        await reloadThread();
      } finally {
        setSending(false);
      }
    });
  }

  async function react(comment: FeedComment, kind: ReactionKind) {
    setPickerFor(null);
    if (thread.status !== "ready") return;
    const before = thread.comments;
    const snapshot = comment.reactions;
    const apply = (reactions: (c: FeedComment) => FeedComment["reactions"]) =>
      setThread({
        status: "ready",
        comments: before.map((c) =>
          c.commentId === comment.commentId ? { ...c, reactions: reactions(c) } : c,
        ),
      });
    apply((c) => pickReaction(c.reactions, kind));
    const result = await reactToComment(comment.commentId, kind);
    if (!result.ok) {
      setError(result.error);
      setThread({ status: "ready", comments: before });
    } else {
      apply(() => settleReaction(snapshot, kind, result.value));
    }
  }

  const tally = reactionTally(group.reactions, REACTION_KINDS);
  const commentCount = comments ? comments.length : group.comments.length;
  const reactions =
    filter === "all"
      ? group.reactions
      : filter === "comments"
        ? []
        : group.reactions.filter((r) => r.reactionKind === filter);
  const showComments = filter === "all" || filter === "comments";

  const chips: { id: Filter; label: string; emoji?: string; count: number }[] = [
    { id: "all", label: "All", count: group.reactions.length + commentCount },
    ...tally.map(({ kind, count }) => ({
      id: kind,
      label: REACTION_LABELS[kind],
      emoji: REACTION_EMOJI[kind],
      count,
    })),
    ...(commentCount > 0
      ? [{ id: "comments" as const, label: "Comments", emoji: "💬", count: commentCount }]
      : []),
  ];

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        <button
          type="button"
          onClick={onOpen}
          className="press flex w-full min-w-0 items-center gap-3 px-1 pt-1.5 pb-3.5 text-left"
        >
          <GroupIcon group={group} size="lg" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xl font-bold tracking-[-0.025em]">
              {group.title}
            </span>
            <span className="block truncate text-sm text-zinc-500">{groupMeta(group, today)}</span>
          </span>
        </button>

        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-3">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={filter === chip.id}
              aria-label={`${chip.label}, ${chip.count}`}
              onClick={() => setFilter(chip.id)}
              className="flex min-h-11 shrink-0 items-center"
            >
              <span
                className={`flex h-8 items-center gap-1 rounded-full px-3 text-sm font-semibold tabular-nums ${
                  filter === chip.id
                    ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                    : "surface"
                }`}
              >
                {chip.emoji ? (
                  <span aria-hidden="true" className="text-[15px]">
                    {chip.emoji}
                  </span>
                ) : (
                  chip.label
                )}
                <span>{chip.count}</span>
              </span>
            </button>
          ))}
        </div>

        {showComments && commentCount > 0 && (
          <>
            <h3 className={`${GROUP_LABEL} pt-1`}>Comments</h3>
            {thread.status === "loading" && (
              <p className="py-4 text-center text-sm text-zinc-500">Loading…</p>
            )}
            {thread.status === "error" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="allow-pwa-select text-sm text-zinc-600 dark:text-zinc-400">
                  {thread.error}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setThread({ status: "loading" });
                    void reloadThread();
                  }}
                  className="min-h-11 rounded-full bg-zinc-500/12 px-5 text-sm font-semibold dark:bg-zinc-500/24"
                >
                  Try again
                </button>
              </div>
            )}
            {comments && (
              <ol className="surface flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                {comments.map((comment) => (
                  <li
                    key={comment.commentId}
                    className="flex min-w-0 items-start gap-3 py-2.5 pr-2 pl-3.5"
                  >
                    <Avatar
                      username={comment.username}
                      avatar={comment.avatar}
                      className="mt-0.5 h-9 w-9 text-sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px]">
                        <span className="font-semibold">
                          {comment.mine ? "You" : comment.username}
                        </span>
                        <span className="ml-1 text-[13px] text-zinc-500">
                          {shortAgo(comment.createdAt)}
                        </span>
                      </p>
                      <p className="allow-pwa-select text-[15px] leading-snug break-words">
                        <CommentBody body={comment.body} friendNames={friendNames} />
                      </p>
                    </div>
                    <ReactButton
                      reactions={comment.reactions}
                      pickerOpen={pickerFor === comment.commentId}
                      onOpenPicker={() =>
                        setPickerFor((open) =>
                          open === comment.commentId ? null : comment.commentId,
                        )
                      }
                      onClosePicker={closePicker}
                      onPick={(kind) => void react(comment, kind)}
                      ariaLabel={`React to ${comment.username}'s comment`}
                    />
                  </li>
                ))}
              </ol>
            )}
          </>
        )}

        {reactions.length > 0 && (
          <>
            <h3 className={GROUP_LABEL}>Reactions</h3>
            <ul className="surface flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
              {reactions.map((reaction) => (
                <li
                  key={reaction.id}
                  className="flex min-w-0 items-center gap-3 py-2.5 pr-3.5 pl-3.5"
                >
                  <Avatar
                    username={reaction.actorUsername}
                    avatar={reaction.actorAvatar}
                    className="h-9 w-9 text-sm"
                  />
                  <span className="min-w-0 flex-1 truncate text-[15px]">
                    <span className="font-semibold">{reaction.actorUsername}</span>
                    <span className="ml-1 text-[13px] text-zinc-500">
                      {shortAgo(reaction.occurredAt)}
                    </span>
                  </span>
                  {reaction.reactionKind && (
                    <span
                      className="text-[22px] leading-none"
                      role="img"
                      aria-label={REACTION_LABELS[reaction.reactionKind]}
                    >
                      {REACTION_EMOJI[reaction.reactionKind]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex shrink-0 touch-none flex-col gap-1.5 border-t border-zinc-200 px-4 pt-2.5 dark:border-zinc-800"
        style={{
          paddingBottom: keyboardOpen ? "8px" : "max(12px, env(safe-area-inset-bottom))",
        }}
      >
        {error && (
          <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>
        )}
        <div className="flex min-w-0 items-center gap-2.5">
          <input
            type="text"
            enterKeyHint="send"
            value={draft}
            maxLength={COMMENT_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Reply"
            aria-label="Reply"
            className="min-h-10 min-w-0 flex-1 rounded-full bg-white px-4 text-base dark:bg-zinc-900"
          />
          <button
            type="submit"
            aria-label="Send reply"
            disabled={sending || draft.trim() === ""}
            className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground disabled:bg-zinc-500/12 disabled:text-zinc-400 dark:disabled:bg-zinc-500/24"
          >
            <ArrowUp className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      </form>
    </>
  );
}

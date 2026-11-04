"use client";

import { CallMark } from "@/components/dpr/call-mark";
import { Avatar } from "@/components/friends/avatar";
import { addComment, deleteComment, fetchComments, reactToComment } from "@/lib/friends/client";
import { withReaction } from "@/lib/friends/format";
import { timeAgo } from "@/lib/friends/post-media";
import type { CommentTarget, FeedComment } from "@/lib/friends/types";
import { useFriends } from "@/lib/friends/use-friends";
import { type LogGuard, createLogGuard } from "@/lib/workout/log-guard";
import {
  COMMENT_MAX_LENGTH,
  REACTION_EMOJI,
  REACTION_KINDS,
  REACTION_LABELS,
  type ReactionKind,
  commentError,
  commentSegments,
  normalizeComment,
} from "@jim/core";
import { SmilePlus } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Quick emoji above the input; a tap adds one to the comment. */
const QUICK_EMOJI = ["🔥", "💪", "👏", "🙌", "😤", "💯"];

type Load =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; comments: FeedComment[] };

/**
 * A workout's or post's comments as a bottom sheet over the feed (issue
 * #749): a grab handle and title, the thread, quick emoji and an input that
 * stays above the iOS keyboard. Server data, loaded each time it opens.
 * Portaled to <body> and locks the page behind it (docs/PWA.md §2).
 */
export function CommentsSheet({
  target,
  ownerUsername,
  onClose,
  onChange,
}: {
  target: CommentTarget;
  /** Whose workout or post it is, for the input's placeholder. */
  ownerUsername: string;
  onClose: () => void;
  /** The thread after a load or a change, so the feed can update its count. */
  onChange?: (comments: FeedComment[]) => void;
}) {
  const titleId = useId();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const keyboardInset = useKeyboardInset();
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

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const show = useCallback((comments: FeedComment[]) => {
    setLoad({ status: "ready", comments });
    onChangeRef.current?.(comments);
  }, []);

  const reload = useCallback(async () => {
    const result = await fetchComments(target);
    if (result.ok) show(result.value);
    else {
      const { error } = result;
      setLoad((current) => (current.status === "ready" ? current : { status: "error", error }));
    }
  }, [target, show]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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

  // A double tap on Post (or Post plus the keyboard's Send) posts once: the
  // guard holds until the reloaded thread has rendered (LESSONS #491).
  const postGuard = useRef<LogGuard | null>(null);
  postGuard.current ??= createLogGuard();
  const comments = load.status === "ready" ? load.comments : null;
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
        await reload();
        requestAnimationFrame(() =>
          listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" }),
        );
      } finally {
        setSending(false);
      }
    });
  }

  async function remove(comment: FeedComment) {
    if (!window.confirm("Delete this comment?")) return;
    setError(null);
    const result = await deleteComment(comment.commentId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (load.status === "ready") {
      show(load.comments.filter((c) => c.commentId !== comment.commentId));
    }
  }

  async function react(comment: FeedComment, kind: ReactionKind) {
    setPickerFor(null);
    if (load.status !== "ready") return;
    const before = load.comments;
    const wasMine = comment.reactions.some((r) => r.kind === kind && r.mine);
    // One reaction per person: picking another kind replaces theirs.
    const optimistic = (reactions: FeedComment["reactions"]) => {
      const cleared = reactions.reduce(
        (acc, r) => (r.mine ? withReaction(acc, r.kind, false) : acc),
        reactions,
      );
      return wasMine ? cleared : withReaction(cleared, kind, true);
    };
    show(
      before.map((c) =>
        c.commentId === comment.commentId ? { ...c, reactions: optimistic(c.reactions) } : c,
      ),
    );
    const result = await reactToComment(comment.commentId, kind);
    if (!result.ok) {
      setError(result.error);
      show(before);
    }
  }

  function reply(comment: FeedComment) {
    setDraft((current) => {
      const mention = `@${comment.username} `;
      return current.startsWith(mention) ? current : `${mention}${current}`;
    });
    inputRef.current?.focus();
  }

  return createPortal(
    // z-30: above the tab bar and FloatingCard (z-20), like the reorder sheet.
    <div
      className="safe-x fixed inset-0 z-30 flex flex-col justify-end overscroll-none"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <button
        type="button"
        aria-label="Close comments"
        onClick={onClose}
        className="absolute! inset-0 touch-none bg-black/40"
      />
      <section
        aria-labelledby={titleId}
        className="route-fade relative flex h-[75lvh] max-h-full flex-col rounded-t-3xl bg-white text-zinc-950 shadow-2xl dark:bg-zinc-950 dark:text-zinc-50"
        style={{ marginBottom: keyboardInset }}
      >
        <header className="flex shrink-0 touch-none flex-col items-center gap-2 border-b border-zinc-200 pt-2 pb-3 dark:border-zinc-800">
          <span
            aria-hidden="true"
            className="h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700"
          />
          <h2 id={titleId} className="text-base font-semibold">
            Comments
          </h2>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {load.status === "loading" && (
            <p className="py-6 text-center text-sm text-zinc-500">Loading…</p>
          )}
          {load.status === "error" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="allow-pwa-select text-sm text-zinc-600 dark:text-zinc-400">
                {load.error}
              </p>
              <button
                type="button"
                onClick={() => {
                  setLoad({ status: "loading" });
                  void reload();
                }}
                className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
              >
                Try again
              </button>
            </div>
          )}
          {load.status === "ready" && load.comments.length === 0 && (
            <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No comments yet. Say something nice.
            </p>
          )}
          {load.status === "ready" && load.comments.length > 0 && (
            <ol ref={listRef} className="flex flex-col gap-4">
              {load.comments.map((comment) => (
                <CommentRow
                  key={comment.commentId}
                  comment={comment}
                  friendNames={friendNames}
                  pickerOpen={pickerFor === comment.commentId}
                  onTogglePicker={() =>
                    setPickerFor((open) => (open === comment.commentId ? null : comment.commentId))
                  }
                  onReact={(kind) => void react(comment, kind)}
                  onReply={() => reply(comment)}
                  onDelete={() => void remove(comment)}
                />
              ))}
            </ol>
          )}
        </div>

        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="flex shrink-0 touch-none flex-col gap-2 border-t border-zinc-200 px-4 pt-2 dark:border-zinc-800"
          style={{
            paddingBottom: keyboardInset > 0 ? "8px" : "max(12px, env(safe-area-inset-bottom))",
          }}
        >
          <div className="flex justify-between">
            {QUICK_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Add ${emoji}`}
                onClick={() =>
                  setDraft((current) => `${current}${emoji}`.slice(0, COMMENT_MAX_LENGTH))
                }
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-2xl"
              >
                {emoji}
              </button>
            ))}
          </div>
          {error && (
            <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>
          )}
          <div className="flex min-w-0 items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              enterKeyHint="send"
              value={draft}
              maxLength={COMMENT_MAX_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={`Add a comment for ${ownerUsername}…`}
              aria-label="Comment"
              className="min-h-11 min-w-0 flex-1 rounded-full border border-zinc-300 bg-white px-4 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              disabled={sending || draft.trim() === ""}
              className="min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-accent disabled:opacity-40"
            >
              {sending ? "Posting…" : "Post"}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}

function CommentRow({
  comment,
  friendNames,
  pickerOpen,
  onTogglePicker,
  onReact,
  onReply,
  onDelete,
}: {
  comment: FeedComment;
  friendNames: ReadonlySet<string>;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onReact: (kind: ReactionKind) => void;
  onReply: () => void;
  onDelete: () => void;
}) {
  const mine = comment.reactions.find((r) => r.mine);
  const total = comment.reactions.reduce((sum, r) => sum + r.count, 0);
  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <Avatar username={comment.username} avatar={comment.avatar} className="h-9 w-9 text-sm" />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="allow-pwa-select break-words text-sm">
            <span className="font-semibold">{comment.username}</span>{" "}
            <CommentBody body={comment.body} friendNames={friendNames} />
          </p>
          <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>{timeAgo(comment.createdAt).replace(/ ago$/, "")}</span>
            {!comment.mine && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={onReply}
                  aria-label={`Reply to ${comment.username}`}
                  className="min-h-8 px-1 font-semibold"
                >
                  Reply
                </button>
              </>
            )}
            {comment.canDelete && (
              <>
                <span aria-hidden="true">·</span>
                <button type="button" onClick={onDelete} className="min-h-8 px-1 font-semibold">
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onTogglePicker}
          aria-expanded={pickerOpen}
          aria-label={`React to ${comment.username}'s comment${
            mine ? `, you reacted ${REACTION_LABELS[mine.kind]}` : ""
          }${total > 0 ? `, ${total} ${total === 1 ? "reaction" : "reactions"}` : ""}`}
          className="flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center text-zinc-500 dark:text-zinc-400"
        >
          {mine ? (
            <span className="text-lg leading-none" aria-hidden="true">
              {REACTION_EMOJI[mine.kind]}
            </span>
          ) : (
            <SmilePlus className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          )}
          {total > 0 && <span className="text-xs tabular-nums">{total}</span>}
        </button>
      </div>
      {pickerOpen && (
        <div className="ml-12 flex gap-1 rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
          {REACTION_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={mine?.kind === kind}
              aria-label={REACTION_LABELS[kind]}
              onClick={() => onReact(kind)}
              className={`flex min-h-11 min-w-11 items-center justify-center rounded-full text-xl ${
                mine?.kind === kind ? "bg-white dark:bg-zinc-800" : ""
              }`}
            >
              {REACTION_EMOJI[kind]}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

/** A comment's text with friends' @mentions bold and typed PRP calls as word marks. */
export function CommentBody({
  body,
  friendNames,
}: {
  body: string;
  friendNames: ReadonlySet<string>;
}) {
  return (
    <>
      {commentSegments(body, friendNames).map((segment, index) => {
        const key = `${index}`;
        if (segment.type === "mention") {
          return (
            <span key={key} className="font-semibold text-accent">
              @{segment.username}
            </span>
          );
        }
        if (segment.type === "call") return <CallMark key={key} call={segment.call} />;
        return <span key={key}>{segment.text}</span>;
      })}
    </>
  );
}

/**
 * How far the on-screen keyboard covers the bottom of the layout viewport,
 * so the sheet's input sits right above it (docs/PWA.md §2). 0 when the
 * keyboard is down or `visualViewport` isn't there.
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () =>
      setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

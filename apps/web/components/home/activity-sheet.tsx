"use client";

import { Avatar } from "@/components/friends/avatar";
import { fetchActivity, markActivitySeen } from "@/lib/friends/client";
import type { ActivityItem } from "@/lib/friends/types";
import { REACTION_EMOJI, REACTION_LABELS } from "@jim/core";
import { UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

function relativeTime(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function rowLabel(item: ActivityItem): string {
  switch (item.kind) {
    case "workout_reaction":
      return item.reactionKind
        ? `${REACTION_LABELS[item.reactionKind]} your ${item.sessionName ?? "workout"}`
        : `Reacted to your ${item.sessionName ?? "workout"}`;
    case "post_reaction":
      return item.reactionKind
        ? `${REACTION_LABELS[item.reactionKind]} your post`
        : "Reacted to your post";
    case "friend_request":
      return "Sent you a friend request";
    case "comment":
      return "Commented on your post";
  }
}

function rowHref(item: ActivityItem): string {
  if (item.kind === "friend_request") return "/friends";
  if (item.kind === "workout_reaction" && item.sessionId) return `/history/${item.sessionId}`;
  if (item.kind === "post_reaction" && item.postId) return `/home?focus=${item.postId}`;
  if (item.kind === "comment") {
    if (item.sessionId) return `/home?focus=${item.sessionId}`;
    if (item.postId) return `/home?focus=${item.postId}`;
  }
  if (item.sessionId) return `/home?focus=${item.sessionId}`;
  if (item.postId) return `/home?focus=${item.postId}`;
  return "/home";
}

/**
 * The Home header bell's activity list (#753): reactions to your workouts,
 * friend requests, and (later) comments — merged in one sheet.
 */
export function ActivitySheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchActivity();
    if (result.ok) {
      setItems(result.value.items);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    void load();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [load, onClose]);

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

  useEffect(() => {
    void markActivitySeen();
  }, []);

  function openRow(item: ActivityItem) {
    onClose();
    router.push(rowHref(item));
  }

  if (!mounted) return null;

  return createPortal(
    <div className="sheet-backdrop fixed inset-0 z-30 flex flex-col overscroll-none bg-black/30 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close activity"
        onClick={onClose}
        className="absolute! inset-0 touch-none"
      />
      <section
        className="route-fade safe-x relative z-10 mt-auto flex max-h-[min(85lvh,640px)] min-h-0 flex-col rounded-t-2xl bg-white pb-[max(12px,env(safe-area-inset-bottom))] dark:bg-zinc-950"
        style={{ paddingTop: "max(12px, var(--top-inset))" }}
        aria-labelledby="activity-sheet-title"
      >
        <header className="flex shrink-0 touch-none items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 id="activity-sheet-title" className="text-lg font-semibold tracking-tight">
            Activity
          </h2>
          <button
            type="button"
            aria-label="Close activity"
            onClick={onClose}
            data-ripple
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-zinc-600 dark:text-zinc-400"
          >
            <X className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2">
          {loading && (
            <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-500">Loading…</p>
          )}
          {error && (
            <p className="allow-pwa-select py-8 text-center text-sm text-red-600 dark:text-red-500">
              {error}
            </p>
          )}
          {!loading && !error && items.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
              You're all caught up.
            </p>
          )}
          <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openRow(item)}
                  className="flex w-full min-h-14 items-center gap-3 py-3 text-left"
                >
                  <Avatar username={item.actorUsername} avatar={item.actorAvatar} />
                  <span className="min-w-0 flex-1">
                    <span className="allow-pwa-select block truncate text-sm text-zinc-950 dark:text-zinc-50">
                      <span className="font-medium">@{item.actorUsername}</span> {rowLabel(item)}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-500">
                      {relativeTime(item.occurredAt)}
                    </span>
                  </span>
                  {(item.kind === "workout_reaction" || item.kind === "post_reaction") &&
                    item.reactionKind && (
                      <span className="text-xl leading-none" aria-hidden="true">
                        {REACTION_EMOJI[item.reactionKind]}
                      </span>
                    )}
                  {item.kind === "friend_request" && (
                    <UserPlus
                      className="h-5 w-5 shrink-0 text-zinc-500"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
          {!loading && items.some((item) => item.kind === "friend_request") && (
            <p className="pb-4 pt-2 text-center text-xs text-zinc-600 dark:text-zinc-400">
              <Link href="/friends" onClick={onClose} className="underline underline-offset-2">
                Open Friends
              </Link>{" "}
              to answer requests.
            </p>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}

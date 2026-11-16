import type { PostKind, ReactionKind, RoutineIconColor, RoutineIconShape } from "@jim/core";
import type { ActivityItem, CommentTarget } from "./types";

// The Activity sheet (#818) shows reactions and comments grouped by the
// workout or post they're on, with friend requests on their own.

export interface ActivityGroup {
  key: string;
  /** Where its comments live, for the detail view and Reply. */
  target: CommentTarget;
  kind: PostKind;
  title: string;
  routineIcon: { shape: RoutineIconShape; color: RoutineIconColor } | null;
  /** When the workout started, or a post's newest activity, for the day label. */
  at: string;
  durationMinutes: number | null;
  postDetail: string | null;
  /** Newest first. */
  reactions: ActivityItem[];
  /** Newest first. */
  comments: ActivityItem[];
  latestAt: string;
  isNew: boolean;
}

export interface ActivitySections {
  requests: ActivityItem[];
  fresh: ActivityGroup[];
  earlier: ActivityGroup[];
}

/** A record or achievement post groups on its own; anything about a workout groups by workout. */
function groupKey(item: ActivityItem): string | null {
  if (item.postId && item.postKind && item.postKind !== "workout") return `post:${item.postId}`;
  if (item.sessionId) return `session:${item.sessionId}`;
  if (item.postId) return `post:${item.postId}`;
  return null;
}

function newGroup(key: string, item: ActivityItem): ActivityGroup {
  const isPost = key.startsWith("post:");
  const kind: PostKind = isPost ? (item.postKind ?? "workout") : "workout";
  const started = item.sessionStartedAt;
  const ended = item.sessionEndedAt;
  const durationMinutes =
    !isPost && started && ended
      ? Math.max(0, Math.round((Date.parse(ended) - Date.parse(started)) / 60_000))
      : null;
  return {
    key,
    target: isPost ? { postId: item.postId as string } : { sessionId: item.sessionId as string },
    kind,
    title: isPost ? (item.postTitle ?? "Post") : (item.sessionName ?? "Workout"),
    routineIcon: isPost ? null : item.routineIcon,
    at: (!isPost && started) || item.occurredAt,
    durationMinutes,
    postDetail: isPost ? item.postDetail : null,
    reactions: [],
    comments: [],
    latestAt: item.occurredAt,
    isNew: false,
  };
}

/** Splits the activity list into friend requests and per-post groups, New before Earlier. */
export function groupActivity(items: readonly ActivityItem[]): ActivitySections {
  const requests: ActivityItem[] = [];
  const groups = new Map<string, ActivityGroup>();
  const sorted = [...items].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  for (const item of sorted) {
    if (item.kind === "friend_request") {
      requests.push(item);
      continue;
    }
    const key = groupKey(item);
    if (!key) continue;
    let group = groups.get(key);
    if (!group) {
      group = newGroup(key, item);
      groups.set(key, group);
    }
    if (item.kind === "comment") group.comments.push(item);
    else if (item.reactionKind) group.reactions.push(item);
    else continue;
    if (item.isNew) group.isNew = true;
  }
  const all = [...groups.values()];
  return {
    requests,
    fresh: all.filter((group) => group.isNew),
    earlier: all.filter((group) => !group.isNew),
  };
}

/** Each emoji's count, most used first, ties in picker order. */
export function reactionTally(
  reactions: readonly ActivityItem[],
  order: readonly ReactionKind[],
): { kind: ReactionKind; count: number }[] {
  const counts = new Map<ReactionKind, number>();
  for (const item of reactions) {
    if (item.reactionKind) counts.set(item.reactionKind, (counts.get(item.reactionKind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.kind) - order.indexOf(b.kind));
}

/** "maya", "maya and theo", "maya, theo and sam", then "maya, theo +3". */
export function peopleLine(usernames: readonly string[]): { names: string[]; more: number } {
  const unique = [...new Set(usernames)];
  if (unique.length <= 3) return { names: unique, more: 0 };
  return { names: unique.slice(0, 2), more: unique.length - 2 };
}

/** "Today", "Yesterday", a weekday within the last week, then "Nov 3". */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(then)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return then.toLocaleDateString(undefined, { weekday: "short" });
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

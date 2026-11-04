import { unauthenticated } from "@/lib/api/route-helpers";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import { NO_COMMENTS, loadCommentSummaries } from "@/lib/friends/comment-summaries";
import { loadReactionNames } from "@/lib/friends/reaction-names";
import type { FriendPost, WorkoutReaction } from "@/lib/friends/types";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

interface PostRow extends Record<string, unknown> {
  post_id: string;
  user_id: string;
  username: string;
  avatar: string | null;
  kind: FriendPost["kind"];
  session_id: string | null;
  title: string;
  detail: string | null;
  caption: string | null;
  created_at: Date | string;
  reactions: WorkoutReaction[];
}

/**
 * Accepted friends' posts (issue #316), newest first, from migration 0031's
 * `friend_posts()` — like their workouts, never read from the posts table
 * directly (ADR-017).
 */
function friendIdFrom(request: Request): string | null {
  const value = new URL(request.url).searchParams.get("friendId");
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

export async function GET(request: Request) {
  const friendId = friendIdFrom(request);
  try {
    const posts = await withUserDb(async (tx): Promise<FriendPost[]> => {
      const rows = await tx.execute<PostRow>(
        friendId
          ? sql`SELECT * FROM friend_posts(30, ${friendId}::uuid)`
          : sql`SELECT * FROM friend_posts(30)`,
      );
      // A workout post's comments are its workout's; the other kinds have their own.
      const sessionIds = rows.flatMap((row) => (row.session_id ? [row.session_id] : []));
      const postIds = rows.flatMap((row) => (row.session_id ? [] : [row.post_id]));
      const { bySession, byPost } = await loadCommentSummaries(tx, sessionIds, postIds);
      const { bySession: namesBySession, byPost: namesByPost } = await loadReactionNames(
        tx,
        sessionIds,
        postIds,
      );
      return rows.map((row) => ({
        postId: row.post_id,
        userId: row.user_id,
        username: row.username,
        avatar: row.avatar,
        kind: row.kind,
        sessionId: row.session_id,
        title: row.title,
        detail: row.detail,
        caption: row.caption,
        createdAt: new Date(row.created_at).toISOString(),
        reactions: row.reactions.map((reaction) => ({
          kind: reaction.kind,
          count: Number(reaction.count),
          mine: reaction.mine,
        })),
        reactedBy: row.session_id
          ? (namesBySession.get(row.session_id) ?? [])
          : (namesByPost.get(row.post_id) ?? []),
        comments:
          (row.session_id ? bySession.get(row.session_id) : byPost.get(row.post_id)) ?? NO_COMMENTS,
      }));
    });
    return NextResponse.json({ posts });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return unauthenticated();
    }
    throw error;
  }
}

import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
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
export async function GET() {
  try {
    const posts = await withUserDb(async (tx): Promise<FriendPost[]> => {
      const rows = await tx.execute<PostRow>(sql`SELECT * FROM friend_posts(30)`);
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
      }));
    });
    return NextResponse.json({ posts });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    throw error;
  }
}

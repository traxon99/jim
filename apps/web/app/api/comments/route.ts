import { isUuid, readJsonObject, unauthenticated } from "@/lib/api/route-helpers";
import { ensureUserRow } from "@/lib/db/ensure-user-row";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import type { CommentTarget, FeedComment, WorkoutReaction } from "@/lib/friends/types";
import { commentError, normalizeComment } from "@jim/core";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

// Comments on a workout or a record/achievement post (issue #749). Read and
// written only through migration 0063's SECURITY DEFINER functions, which
// allow the owner and their accepted friends (ADR-017).

interface CommentRow extends Record<string, unknown> {
  comment_id: string;
  user_id: string;
  username: string;
  avatar: string | null;
  body: string;
  created_at: Date | string;
  mine: boolean;
  can_delete: boolean;
  reactions: WorkoutReaction[];
}

/** `{ sessionId }` or `{ postId }`, exactly one, or null when malformed. */
function parseTarget(sessionId: unknown, postId: unknown): CommentTarget | null {
  const hasSession = sessionId !== undefined && sessionId !== null;
  const hasPost = postId !== undefined && postId !== null;
  if (hasSession === hasPost) return null;
  if (hasSession) return isUuid(sessionId) ? { sessionId } : null;
  return isUuid(postId) ? { postId } : null;
}

function targetSql(target: CommentTarget) {
  const sessionId = "sessionId" in target ? target.sessionId : null;
  const postId = "postId" in target ? target.postId : null;
  return sql`${sessionId}::uuid, ${postId}::uuid`;
}

/** A thread, oldest first: `?sessionId=` or `?postId=`. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const target = parseTarget(
    params.get("sessionId") ?? undefined,
    params.get("postId") ?? undefined,
  );
  if (!target) return NextResponse.json({ error: "Invalid comment thread" }, { status: 400 });

  try {
    const comments = await withUserDb(async (tx): Promise<FeedComment[]> => {
      const rows = await tx.execute<CommentRow>(
        sql`SELECT * FROM list_comments(${targetSql(target)})`,
      );
      return rows.map((row) => ({
        commentId: row.comment_id,
        userId: row.user_id,
        username: row.username,
        avatar: row.avatar,
        body: row.body,
        createdAt: new Date(row.created_at).toISOString(),
        mine: row.mine,
        canDelete: row.can_delete,
        reactions: row.reactions.map((reaction) => ({
          kind: reaction.kind,
          count: Number(reaction.count),
          mine: reaction.mine,
        })),
      }));
    });
    return NextResponse.json({ comments });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

/** Adds a comment: `{ sessionId | postId, body }`. Answers `{ commentId }`. */
export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const target = parseTarget(body?.sessionId, body?.postId);
  if (!target || typeof body?.body !== "string") {
    return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
  }
  const text = normalizeComment(body.body);
  const invalid = commentError(text);
  if (invalid || text === null) {
    return NextResponse.json({ error: invalid ?? "Invalid comment" }, { status: 400 });
  }

  try {
    const commentId = await withUserDb(async (tx, userId, email) => {
      await ensureUserRow(tx, userId, email);
      const [row] = await tx.execute<{ id: string | null }>(
        sql`SELECT add_comment(${targetSql(target)}, ${text}) AS id`,
      );
      return row?.id ?? null;
    });
    if (!commentId) {
      return NextResponse.json({ error: "That isn't a friend's workout or post" }, { status: 404 });
    }
    return NextResponse.json({ commentId });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

/** Deletes a comment its author wrote, or one on the signed-in user's own workout or post. */
export async function DELETE(request: Request) {
  const commentId = (await readJsonObject(request))?.commentId;
  if (!isUuid(commentId)) {
    return NextResponse.json({ error: "Invalid comment id" }, { status: 400 });
  }

  try {
    const ok = await withUserDb(async (tx) => {
      const [row] = await tx.execute<{ ok: boolean }>(
        sql`SELECT delete_comment(${commentId}::uuid) AS ok`,
      );
      return row?.ok ?? false;
    });
    if (!ok) return NextResponse.json({ error: "No such comment" }, { status: 404 });
    return NextResponse.json({ ok });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

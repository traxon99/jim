import { ensureUserRow } from "@/lib/db/ensure-user-row";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import type { OwnPost } from "@/lib/friends/types";
import { type PostDraft, isPostKind, normalizePostDraft, postDraftError } from "@jim/core";
import { posts, sessions } from "@jim/db";
import { desc, eq, isNull, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

// The signed-in user's own posts (issue #316). Read under RLS (posts are
// readable by their author only); created and deleted through migration
// 0031's SECURITY DEFINER functions, which check a linked workout is theirs.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unauthenticated() {
  return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : undefined;
}

/** A draft from a request body, or null when it's malformed. */
function parseDraft(body: Record<string, unknown> | null): PostDraft | null {
  if (!body || !isPostKind(body.kind) || typeof body.title !== "string") return null;
  const sessionId = body.sessionId ?? null;
  if (sessionId !== null && (typeof sessionId !== "string" || !UUID_PATTERN.test(sessionId))) {
    return null;
  }
  const detail = optionalText(body.detail);
  const caption = optionalText(body.caption);
  if (detail === undefined || caption === undefined) return null;
  return normalizePostDraft({ kind: body.kind, sessionId, title: body.title, detail, caption });
}

/** The signed-in user's posts, newest first; a deleted workout's post drops out. */
export async function GET() {
  try {
    const own = await withUserDb(async (tx): Promise<OwnPost[]> => {
      const rows = await tx
        .select({
          postId: posts.id,
          kind: posts.kind,
          sessionId: posts.sessionId,
          title: posts.title,
          detail: posts.detail,
          caption: posts.caption,
          createdAt: posts.createdAt,
        })
        .from(posts)
        .leftJoin(sessions, eq(sessions.id, posts.sessionId))
        .where(or(isNull(posts.sessionId), isNull(sessions.deletedAt)))
        .orderBy(desc(posts.createdAt))
        .limit(50);
      return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
    });
    return NextResponse.json({ posts: own });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

/** Shares something with friends: `{ kind, sessionId?, title, detail?, caption? }`. */
export async function POST(request: Request) {
  const draft = parseDraft(await readJson(request));
  if (!draft) return NextResponse.json({ error: "Invalid post" }, { status: 400 });
  const invalid = postDraftError(draft);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  try {
    const postId = await withUserDb(async (tx, userId, email) => {
      await ensureUserRow(tx, userId, email);
      const [row] = await tx.execute<{ id: string | null }>(
        sql`SELECT create_post(${draft.kind}::post_kind, ${draft.sessionId}::uuid, ${draft.title},
          ${draft.detail}, ${draft.caption}) AS id`,
      );
      return row?.id ?? null;
    });
    if (!postId) {
      return NextResponse.json(
        { error: "That workout hasn't synced yet — try again in a moment" },
        { status: 404 },
      );
    }
    return NextResponse.json({ postId });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

/** Deletes one of the signed-in user's posts: `{ postId }`. */
export async function DELETE(request: Request) {
  const postId = (await readJson(request))?.postId;
  if (typeof postId !== "string" || !UUID_PATTERN.test(postId)) {
    return NextResponse.json({ error: "Invalid post id" }, { status: 400 });
  }

  try {
    const ok = await withUserDb(async (tx) => {
      const [row] = await tx.execute<{ ok: boolean }>(
        sql`SELECT delete_post(${postId}::uuid) AS ok`,
      );
      return row?.ok ?? false;
    });
    if (!ok) return NextResponse.json({ error: "No such post" }, { status: 404 });
    return NextResponse.json({ ok });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

import { isUuid, readJsonObject, unauthenticated } from "@/lib/api/route-helpers";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import { isReactionKind } from "@jim/core";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Reacts to a comment (issue #749): `{ commentId, kind }`. One reaction per
 * person, so another kind replaces theirs and the same kind takes it back.
 * Answers `{ reacted }`, whether `kind` is now theirs.
 */
export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const commentId = body?.commentId;
  const kind = body?.kind;
  if (!isUuid(commentId) || !isReactionKind(kind)) {
    return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
  }

  try {
    const reacted = await withUserDb(async (tx) => {
      const [row] = await tx.execute<{ reacted: boolean | null }>(
        sql`SELECT set_comment_reaction(${commentId}::uuid, ${kind}::reaction_kind) AS reacted`,
      );
      return row?.reacted ?? null;
    });
    if (reacted === null) {
      return NextResponse.json({ error: "No such comment" }, { status: 404 });
    }
    return NextResponse.json({ reacted });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

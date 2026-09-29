import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import type { ReceivedReaction } from "@/lib/friends/types";
import { isReactionKind } from "@jim/core";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

// Reactions to friends' workouts (issue #303). Like friendships, they're only
// read and written through migration 0025's SECURITY DEFINER functions.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ReceivedRow extends Record<string, unknown> {
  session_id: string;
  session_name: string | null;
  started_at: Date | string;
  user_id: string;
  username: string;
  kind: ReceivedReaction["kind"];
  created_at: Date | string;
}

function unauthenticated() {
  return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
}

/** Reactions friends left on the signed-in user's own workouts, newest first. */
export async function GET() {
  try {
    const reactions = await withUserDb(async (tx): Promise<ReceivedReaction[]> => {
      const rows = await tx.execute<ReceivedRow>(sql`SELECT * FROM workout_reactions_received(20)`);
      return rows.map((row) => ({
        sessionId: row.session_id,
        sessionName: row.session_name,
        startedAt: new Date(row.started_at).toISOString(),
        userId: row.user_id,
        username: row.username,
        kind: row.kind,
        createdAt: new Date(row.created_at).toISOString(),
      }));
    });
    return NextResponse.json({ reactions });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

/**
 * Adds or takes back a reaction to a friend's workout: `{ sessionId, kind }`.
 * Answers `{ reacted }` — whether the reaction is now there.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const sessionId = body?.sessionId;
  const kind = body?.kind;
  if (typeof sessionId !== "string" || !UUID_PATTERN.test(sessionId) || !isReactionKind(kind)) {
    return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
  }

  try {
    const reacted = await withUserDb(async (tx) => {
      const [row] = await tx.execute<{ reacted: boolean | null }>(
        sql`SELECT toggle_workout_reaction(${sessionId}::uuid, ${kind}::reaction_kind) AS reacted`,
      );
      return row?.reacted ?? null;
    });
    if (reacted === null) {
      return NextResponse.json(
        { error: "That workout isn't one of your friends'" },
        { status: 404 },
      );
    }
    return NextResponse.json({ reacted });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

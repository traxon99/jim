import { isUuid, unauthenticated } from "@/lib/api/route-helpers";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import type { FriendSuggestion } from "@/lib/friends/types";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

interface SuggestionRow extends Record<string, unknown> {
  user_id: string;
  username: string;
  avatar: string | null;
  reason: string;
  mutual_count: number;
}

function mapRow(row: SuggestionRow): FriendSuggestion {
  return {
    userId: row.user_id,
    username: row.username,
    avatar: row.avatar,
    reason: row.reason,
    mutualCount: row.mutual_count,
  };
}

/** People you may know (#754), ranked by mutual friends. */
export async function GET() {
  try {
    const suggestions = await withUserDb(async (tx) => {
      const rows = await tx.execute<SuggestionRow>(sql`SELECT * FROM friend_suggestions(20)`);
      return rows.map(mapRow);
    });
    return NextResponse.json({ suggestions });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

/** Remembers that the signed-in user dismissed a suggestion card. */
export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const userId = body?.userId;
  if (typeof userId !== "string" || !isUuid(userId)) {
    return NextResponse.json({ error: "Invalid user" }, { status: 400 });
  }

  try {
    await withUserDb(async (tx) => {
      await tx.execute(sql`SELECT dismiss_friend_suggestion(${userId}::uuid)`);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

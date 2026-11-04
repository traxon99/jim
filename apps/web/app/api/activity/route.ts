import { unauthenticated } from "@/lib/api/route-helpers";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import type { ActivityItem } from "@/lib/friends/types";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

interface ActivityRow extends Record<string, unknown> {
  activity_id: string;
  kind: ActivityItem["kind"];
  occurred_at: Date | string;
  actor_user_id: string;
  actor_username: string;
  actor_avatar: string | null;
  session_id: string | null;
  session_name: string | null;
  post_id: string | null;
  comment_id: string | null;
  reaction_kind: ActivityItem["reactionKind"];
}

function mapRow(row: ActivityRow): ActivityItem {
  return {
    id: row.activity_id,
    kind: row.kind,
    occurredAt: new Date(row.occurred_at).toISOString(),
    actorUserId: row.actor_user_id,
    actorUsername: row.actor_username,
    actorAvatar: row.actor_avatar,
    sessionId: row.session_id,
    sessionName: row.session_name,
    postId: row.post_id,
    commentId: row.comment_id,
    reactionKind: row.reaction_kind,
  };
}

/** The signed-in user's merged activity feed and unread flag (#753). */
export async function GET() {
  try {
    const payload = await withUserDb(async (tx) => {
      const [unreadRow] = await tx.execute<{ has_unread: boolean }>(
        sql`SELECT activity_has_unread() AS has_unread`,
      );
      const rows = await tx.execute<ActivityRow>(sql`SELECT * FROM list_activity(50)`);
      return {
        unread: unreadRow?.has_unread ?? false,
        items: rows.map(mapRow),
      };
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

/** Marks everything in the activity list as read (#753). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.action !== "mark_seen" && body.action !== undefined) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  try {
    const lastSeenAt = await withUserDb(async (tx) => {
      const [row] = await tx.execute<{ seen_at: Date | string }>(
        sql`SELECT mark_activity_seen() AS seen_at`,
      );
      return row?.seen_at ? new Date(row.seen_at).toISOString() : null;
    });
    return NextResponse.json({ ok: true, lastSeenAt });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

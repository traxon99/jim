import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import type { OpenedShareLink } from "@/lib/sharing/types";
import { parseShareSnapshot } from "@jim/core";
import { shareLinks } from "@jim/db";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

// One share link by its id (issue #254): opened by anyone signed in through
// migration 0036's SECURITY DEFINER function, revoked by its sharer under RLS.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GONE = "This link doesn't work anymore. It may have been revoked.";

function unauthenticated() {
  return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
}

interface LinkRow extends Record<string, unknown> {
  id: string;
  kind: "routine" | "program";
  name: string;
  snapshot: unknown;
  created_at: Date | string;
  username: string | null;
  is_mine: boolean;
}

/** The link's snapshot and who shared it, or 404 once it's revoked. */
export async function GET(_request: Request, context: RouteContext<"/api/shares/[id]">) {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: GONE }, { status: 404 });

  try {
    const row = await withUserDb(async (tx) => {
      const [found] = await tx.execute<LinkRow>(sql`SELECT * FROM get_share_link(${id}::uuid)`);
      return found ?? null;
    });
    const snapshot = row ? parseShareSnapshot(row.snapshot) : null;
    if (!row || !snapshot) return NextResponse.json({ error: GONE }, { status: 404 });
    const link: OpenedShareLink = {
      id: row.id,
      kind: row.kind,
      name: row.name,
      snapshot,
      createdAt: new Date(row.created_at).toISOString(),
      username: row.username,
      isMine: row.is_mine,
    };
    return NextResponse.json(link);
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

/** Revokes one of the signed-in user's links, so it stops working for everyone. */
export async function DELETE(_request: Request, context: RouteContext<"/api/shares/[id]">) {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "No such link" }, { status: 404 });
  }

  try {
    const deleted = await withUserDb(async (tx) =>
      tx.delete(shareLinks).where(eq(shareLinks.id, id)).returning({ id: shareLinks.id }),
    );
    if (deleted.length === 0) return NextResponse.json({ error: "No such link" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

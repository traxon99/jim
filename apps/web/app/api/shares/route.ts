import { ensureUserRow } from "@/lib/db/ensure-user-row";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import type { OwnShareLink } from "@/lib/sharing/types";
import { parseShareSnapshot, shareSnapshotName } from "@jim/core";
import { shareLinks } from "@jim/db";
import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";

// Routine and program share links (issue #254). The sharer's own links are
// read, created and deleted under RLS; anyone else opens one by its id
// through /api/shares/[id]. The phone builds the snapshot from IndexedDB and
// it's checked again here, so a stored snapshot is always well formed.

/** Well past any real routine or program, but keeps a bad client from storing megabytes. */
const MAX_BODY_BYTES = 256 * 1024;

function unauthenticated() {
  return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
}

/** The signed-in user's share links, newest first. */
export async function GET() {
  try {
    const links = await withUserDb(async (tx): Promise<OwnShareLink[]> => {
      const rows = await tx
        .select({
          id: shareLinks.id,
          kind: shareLinks.kind,
          name: shareLinks.name,
          createdAt: shareLinks.createdAt,
        })
        .from(shareLinks)
        .orderBy(desc(shareLinks.createdAt))
        .limit(100);
      return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
    });
    return NextResponse.json({ links });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

/** Freezes a routine or program into a new link: `{ snapshot }`. Returns its id. */
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "That's too big to share" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  const snapshot = parseShareSnapshot(
    typeof body === "object" && body !== null ? (body as { snapshot?: unknown }).snapshot : null,
  );
  if (!snapshot) return NextResponse.json({ error: "Invalid share" }, { status: 400 });

  try {
    const id = await withUserDb(async (tx, userId, email) => {
      await ensureUserRow(tx, userId, email);
      const [row] = await tx
        .insert(shareLinks)
        .values({ userId, kind: snapshot.kind, name: shareSnapshotName(snapshot), snapshot })
        .returning({ id: shareLinks.id });
      return row?.id ?? null;
    });
    if (!id) return NextResponse.json({ error: "Couldn't create the link" }, { status: 500 });
    return NextResponse.json({ id });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

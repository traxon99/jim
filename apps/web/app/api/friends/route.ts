import { ensureUserRow } from "@/lib/db/ensure-user-row";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import type { FriendEntry, FriendRequestResult, FriendsPayload } from "@/lib/friends/types";
import { normalizeUsername } from "@jim/core";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

// Friendships are only ever read and written through migration 0023's
// SECURITY DEFINER functions, which act for auth.uid() alone — see the
// comment on `friendships` in @jim/db's schema for why.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FriendRow extends Record<string, unknown> {
  user_id: string;
  username: string;
  status: FriendEntry["status"];
  direction: FriendEntry["direction"];
  since: Date | string;
}

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

function userIdFrom(body: Record<string, unknown> | null): string | null {
  const userId = body?.userId;
  return typeof userId === "string" && UUID_PATTERN.test(userId) ? userId : null;
}

/** The signed-in user's username, friends and pending requests. */
export async function GET() {
  try {
    const payload = await withUserDb(async (tx, userId, email): Promise<FriendsPayload> => {
      const me = await ensureUserRow(tx, userId, email);
      const rows = await tx.execute<FriendRow>(sql`SELECT * FROM list_friends()`);
      return {
        username: me.username,
        friends: rows.map((row) => ({
          userId: row.user_id,
          username: row.username,
          status: row.status,
          direction: row.direction,
          since: new Date(row.since).toISOString(),
        })),
      };
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

/** Sends a friend request to an exact username: `{ username }`. */
export async function POST(request: Request) {
  const body = await readJson(request);
  const username = typeof body?.username === "string" ? normalizeUsername(body.username) : "";
  if (username === "") {
    return NextResponse.json({ error: "Enter a username" }, { status: 400 });
  }

  try {
    const result = await withUserDb(async (tx, userId, email) => {
      await ensureUserRow(tx, userId, email);
      const [row] = await tx.execute<{ result: FriendRequestResult }>(
        sql`SELECT send_friend_request(${username}) AS result`,
      );
      return row?.result ?? "not_found";
    });
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

/** Accepts or declines an incoming request: `{ userId, accept }`. */
export async function PATCH(request: Request) {
  const body = await readJson(request);
  const requesterId = userIdFrom(body);
  if (!requesterId || typeof body?.accept !== "boolean") {
    return NextResponse.json({ error: "Invalid friend request response" }, { status: 400 });
  }
  const accept = body.accept;

  try {
    const ok = await withUserDb(async (tx) => {
      const [row] = await tx.execute<{ ok: boolean }>(
        sql`SELECT respond_to_friend_request(${requesterId}::uuid, ${accept}) AS ok`,
      );
      return row?.ok ?? false;
    });
    if (!ok) return NextResponse.json({ error: "No such friend request" }, { status: 404 });
    return NextResponse.json({ ok });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

/** Unfriends someone, or cancels a request: `{ userId }`. */
export async function DELETE(request: Request) {
  const otherId = userIdFrom(await readJson(request));
  if (!otherId) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  try {
    const ok = await withUserDb(async (tx) => {
      const [row] = await tx.execute<{ ok: boolean }>(
        sql`SELECT remove_friend(${otherId}::uuid) AS ok`,
      );
      return row?.ok ?? false;
    });
    return NextResponse.json({ ok });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

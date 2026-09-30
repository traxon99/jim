import type { AccessTokenEntry, CreatedAccessToken } from "@/lib/access-tokens/types";
import { ensureUserRow } from "@/lib/db/ensure-user-row";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import {
  accessTokenDisplayPrefix,
  accessTokenExpiresAt,
  accessTokenNameError,
  generateAccessToken,
  hashAccessToken,
  isAccessTokenExpiryDays,
  uuidv7,
} from "@jim/core";
import { personalAccessTokens } from "@jim/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

// Personal access tokens for MCP clients without OAuth (issue #246). Every
// query runs under RLS as the signed-in user; only a hash of each token is
// stored, and the plaintext leaves this server once, in the POST response.

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

function toEntry(row: typeof personalAccessTokens.$inferSelect): AccessTokenEntry {
  return {
    id: row.id,
    name: row.name,
    prefix: row.tokenPrefix,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}

/** The signed-in user's tokens that haven't been revoked, newest first (expired ones included). */
export async function GET() {
  try {
    const tokens = await withUserDb(async (tx) =>
      (
        await tx
          .select()
          .from(personalAccessTokens)
          .where(isNull(personalAccessTokens.revokedAt))
          .orderBy(desc(personalAccessTokens.createdAt))
      ).map(toEntry),
    );
    return NextResponse.json({ tokens });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

/** Creates a token: `{ name, expiresInDays }` (30, 90, 365 or null for never). */
export async function POST(request: Request) {
  const body = await readJson(request);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const nameError = accessTokenNameError(name);
  if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
  const expiresInDays = body?.expiresInDays;
  if (!isAccessTokenExpiryDays(expiresInDays)) {
    return NextResponse.json({ error: "Pick an expiry" }, { status: 400 });
  }

  try {
    const created = await withUserDb(async (tx, userId, email): Promise<CreatedAccessToken> => {
      await ensureUserRow(tx, userId, email);
      const token = generateAccessToken();
      const now = new Date();
      const [row] = await tx
        .insert(personalAccessTokens)
        .values({
          id: uuidv7(),
          userId,
          name,
          tokenHash: await hashAccessToken(token),
          tokenPrefix: accessTokenDisplayPrefix(token),
          createdAt: now,
          expiresAt: accessTokenExpiresAt(expiresInDays, now),
        })
        .returning();
      if (!row) throw new Error("token insert returned no row");
      return { entry: toEntry(row), token };
    });
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

/** Revokes a token: `{ id }`. Takes effect on the MCP server's next request. */
export async function DELETE(request: Request) {
  const body = await readJson(request);
  const id = typeof body?.id === "string" && UUID_PATTERN.test(body.id) ? body.id : null;
  if (!id) return NextResponse.json({ error: "Invalid token id" }, { status: 400 });

  try {
    const revoked = await withUserDb(async (tx) =>
      tx
        .update(personalAccessTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(personalAccessTokens.id, id), isNull(personalAccessTokens.revokedAt)))
        .returning({ id: personalAccessTokens.id }),
    );
    return NextResponse.json({ ok: revoked.length > 0 });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

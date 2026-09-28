import { ensureUserRow } from "@/lib/db/ensure-user-row";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import { normalizeUsername, usernameError } from "@jim/core";
import { users } from "@jim/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const UNIQUE_VIOLATION = "23505";

/** Changes the signed-in user's username (issue #35): `{ username }`. */
export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const raw = (body as { username?: unknown } | null)?.username;
  if (typeof raw !== "string") {
    return NextResponse.json({ error: "Enter a username" }, { status: 400 });
  }
  const username = normalizeUsername(raw);
  const invalid = usernameError(username);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  try {
    const saved = await withUserDb(async (tx, userId, email) => {
      await ensureUserRow(tx, userId, email);
      const [row] = await tx
        .update(users)
        .set({ username })
        .where(eq(users.id, userId))
        .returning({ username: users.username });
      return row?.username ?? null;
    });
    return NextResponse.json({ username: saved });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "That username is taken" }, { status: 409 });
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
  }
  return false;
}

import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import { type DbOrTx, users } from "@jim/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const UNITS = new Set(["lb", "kg"]);

interface SettingsPayload {
  units: "lb" | "kg";
  defaultBarWeight: string;
  availablePlates: string[];
  defaultRestSeconds: number;
  weekStart: number;
}

function toPayload(row: typeof users.$inferSelect): SettingsPayload {
  return {
    units: row.units,
    defaultBarWeight: row.defaultBarWeight,
    availablePlates: row.availablePlates,
    defaultRestSeconds: row.defaultRestSeconds,
    weekStart: row.weekStart,
  };
}

/**
 * S1 notes "a row is created for a user on first sign-in", but nothing in
 * this codebase actually does that yet (no auth trigger, no app-side
 * insert) — this is the first read/write path that needs the row to exist,
 * so it self-heals it here rather than 404ing a brand-new user out of
 * their own settings.
 */
async function ensureUserRow(tx: DbOrTx, userId: string, email: string) {
  await tx.insert(users).values({ id: userId, email }).onConflictDoNothing();
  const [row] = await tx.select().from(users).where(eq(users.id, userId));
  if (!row) throw new Error("Failed to create or load the user's settings row");
  return row;
}

export async function GET() {
  try {
    const payload = await withUserDb(async (tx, userId, email) => {
      const row = await ensureUserRow(tx, userId, email);
      return toPayload(row);
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    throw error;
  }
}

function isValidPatch(body: unknown): body is Partial<SettingsPayload> {
  if (typeof body !== "object" || body === null) return false;
  const candidate = body as Record<string, unknown>;

  if ("units" in candidate && !UNITS.has(candidate.units as string)) return false;
  if ("defaultBarWeight" in candidate) {
    const n = Number(candidate.defaultBarWeight);
    if (!Number.isFinite(n) || n <= 0) return false;
  }
  if ("availablePlates" in candidate) {
    if (!Array.isArray(candidate.availablePlates) || candidate.availablePlates.length === 0) {
      return false;
    }
    if (!candidate.availablePlates.every((p) => typeof p === "number" && p > 0)) return false;
  }
  if ("defaultRestSeconds" in candidate) {
    const n = candidate.defaultRestSeconds;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return false;
  }
  if ("weekStart" in candidate) {
    const n = candidate.weekStart;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 6) return false;
  }
  return true;
}

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidPatch(body)) {
    return NextResponse.json({ error: "Invalid settings payload" }, { status: 400 });
  }

  try {
    const payload = await withUserDb(async (tx, userId, email) => {
      await ensureUserRow(tx, userId, email);

      const patch: Partial<typeof users.$inferInsert> = {};
      if (body.units !== undefined) patch.units = body.units;
      if (body.defaultBarWeight !== undefined) {
        patch.defaultBarWeight = String(body.defaultBarWeight);
      }
      if (body.availablePlates !== undefined) {
        patch.availablePlates = body.availablePlates.map(String);
      }
      if (body.defaultRestSeconds !== undefined) patch.defaultRestSeconds = body.defaultRestSeconds;
      if (body.weekStart !== undefined) patch.weekStart = body.weekStart;

      const [row] = await tx.update(users).set(patch).where(eq(users.id, userId)).returning();
      if (!row) throw new Error("Settings row disappeared mid-update");
      return toPayload(row);
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    throw error;
  }
}

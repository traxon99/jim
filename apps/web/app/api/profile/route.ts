import { ensureUserRow } from "@/lib/db/ensure-user-row";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import type { ProfilePayload } from "@/lib/friends/types";
import { isValidAvatar } from "@jim/core";
import { users } from "@jim/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

// The signed-in user's profile picture and sharing settings (issue #316).
// Like the username, these are server data friends read through migration
// 0031's functions, so they live on the users row but outside /api/settings
// and the settings row the phone caches in IndexedDB.

function toPayload(row: typeof users.$inferSelect): ProfilePayload {
  return {
    username: row.username,
    avatar: row.avatar,
    shareWorkouts: row.shareWorkouts,
    shareWorkoutDetails: row.shareWorkoutDetails,
  };
}

function unauthenticated() {
  return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
}

export async function GET() {
  try {
    const payload = await withUserDb(async (tx, userId, email) =>
      toPayload(await ensureUserRow(tx, userId, email)),
    );
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

type ProfilePatch = Partial<
  Pick<ProfilePayload, "avatar" | "shareWorkouts" | "shareWorkoutDetails">
>;

/** Validates a patch, or returns why it can't be applied. */
function parsePatch(body: unknown): ProfilePatch | string {
  if (typeof body !== "object" || body === null) return "Invalid profile update";
  const candidate = body as Record<string, unknown>;
  const patch: ProfilePatch = {};
  if ("avatar" in candidate) {
    if (candidate.avatar !== null && !isValidAvatar(candidate.avatar)) {
      return "That picture can't be used — try a different photo";
    }
    patch.avatar = candidate.avatar;
  }
  for (const key of ["shareWorkouts", "shareWorkoutDetails"] as const) {
    if (key in candidate) {
      if (typeof candidate[key] !== "boolean") return "Invalid profile update";
      patch[key] = candidate[key];
    }
  }
  return Object.keys(patch).length === 0 ? "Invalid profile update" : patch;
}

/** Changes any of `{ avatar, shareWorkouts, shareWorkoutDetails }`; `avatar: null` removes it. */
export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const patch = parsePatch(body);
  if (typeof patch === "string") return NextResponse.json({ error: patch }, { status: 400 });

  try {
    const payload = await withUserDb(async (tx, userId, email) => {
      await ensureUserRow(tx, userId, email);
      const [row] = await tx.update(users).set(patch).where(eq(users.id, userId)).returning();
      if (!row) throw new UnauthenticatedError();
      return toPayload(row);
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

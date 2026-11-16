import { unauthenticated } from "@/lib/api/route-helpers";
import { ensureUserRow } from "@/lib/db/ensure-user-row";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import { users } from "@jim/db";
import { isValidSettingsPatch, toSettingsColumns, toSettingsPayload } from "@jim/db/admin";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const payload = await withUserDb(async (tx, userId, email) => {
      const row = await ensureUserRow(tx, userId, email);
      return toSettingsPayload(row);
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return unauthenticated();
    }
    throw error;
  }
}

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidSettingsPatch(body)) {
    return NextResponse.json({ error: "Invalid settings payload" }, { status: 400 });
  }

  try {
    const payload = await withUserDb(async (tx, userId, email) => {
      await ensureUserRow(tx, userId, email);

      const patch = toSettingsColumns(body);

      const [row] = await tx.update(users).set(patch).where(eq(users.id, userId)).returning();
      if (!row) throw new Error("Settings row disappeared mid-update");
      return toSettingsPayload(row);
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return unauthenticated();
    }
    throw error;
  }
}

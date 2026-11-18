import { unauthenticated } from "@/lib/api/route-helpers";
import { ensureUserRow } from "@/lib/db/ensure-user-row";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import { loadLeaderboard, parseMachineParam } from "@/lib/friends/leaderboard-data";
import { NextResponse } from "next/server";

/**
 * Who's on one lift's board: you and your accepted friends who share it
 * (issue #837). `slug` is the exercise's catalog slug; `machine` is the JSON
 * `{ brand, model, latitude, longitude }` of a machine exercise. Weights come
 * back in your units; ranking is the client's job.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug")?.trim() ?? "";
  if (slug === "" || slug.length > 200) {
    return NextResponse.json({ error: "Missing exercise" }, { status: 400 });
  }
  const machine = parseMachineParam(params.get("machine"));
  if (machine === "invalid") {
    return NextResponse.json({ error: "Invalid machine" }, { status: 400 });
  }

  try {
    const payload = await withUserDb(async (tx, userId, email) => {
      const me = await ensureUserRow(tx, userId, email);
      return loadLeaderboard(tx, me.units, slug, machine);
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

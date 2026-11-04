import { unauthenticated } from "@/lib/api/route-helpers";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import { loadWeekRingPeople } from "@/lib/friends/week-rings-data";
import { sortWeekRingPeople } from "@jim/core";
import { NextResponse } from "next/server";

/** This week's workout progress for you and accepted friends (issue #750). */
export async function GET() {
  try {
    const people = await withUserDb(async (tx, userId, email) =>
      sortWeekRingPeople(await loadWeekRingPeople(tx, userId, email)),
    );
    return NextResponse.json({ people });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthenticated();
    throw error;
  }
}

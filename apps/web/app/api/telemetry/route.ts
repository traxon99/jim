import { UnauthenticatedError, serviceDb, withUserDb } from "@/lib/db/user-scoped";
import { pruneTelemetry, recordClientTelemetry } from "@/lib/telemetry/server";
import { parseTelemetryBatch } from "@jim/core";
import { NextResponse } from "next/server";

/** About one request in this many also prunes rows past retention. */
const PRUNE_EVERY = 100;

/**
 * Self-hosted telemetry (issue #809): a phone's batched errors, sync
 * failures, Web Vitals and cold starts, tagged with the signed-in user.
 * Sent with sendBeacon, so it always answers 204 and never anything the
 * phone has to act on; a signed-out or malformed batch is dropped.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const events = parseTelemetryBatch(body);
  if (!events || events.length === 0) return new NextResponse(null, { status: 204 });
  try {
    await withUserDb((tx, userId) => recordClientTelemetry(tx, userId, events));
  } catch (error) {
    if (error instanceof UnauthenticatedError) return new NextResponse(null, { status: 204 });
    throw error;
  }
  if (Math.random() * PRUNE_EVERY < 1) {
    await pruneTelemetry(serviceDb()).catch((error: unknown) =>
      console.error("[telemetry] prune failed:", error),
    );
  }
  return new NextResponse(null, { status: 204 });
}

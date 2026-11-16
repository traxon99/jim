import { serviceDb } from "@/lib/db/user-scoped";
import { createClient } from "@/lib/supabase/server";
import { pruneTelemetry, recordClientTelemetry, telemetryAllowance } from "@/lib/telemetry/server";
import { parseTelemetryBatch } from "@jim/core";
import { NextResponse } from "next/server";

/** About one request in this many also prunes rows past retention. */
const PRUNE_EVERY = 100;

const noContent = () => new NextResponse(null, { status: 204 });

/**
 * Self-hosted telemetry (issue #809): a phone's batched errors, sync
 * failures, Web Vitals and cold starts, tagged with the signed-in user.
 * Sent with sendBeacon, so it always answers 204 and never anything the
 * phone has to act on; a signed-out, malformed or over-limit batch is
 * dropped. Written on the server's own connection, outside the user's sync
 * lock, so a burst of reports never waits on or holds up a sync.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return noContent();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noContent();
  }
  const events = parseTelemetryBatch(body);
  if (!events || events.length === 0) return noContent();

  const db = serviceDb();
  const allowance = await telemetryAllowance(db, userId);
  if (allowance === 0) return noContent();
  await recordClientTelemetry(db, userId, events.slice(0, allowance));

  if (Math.random() * PRUNE_EVERY < 1) {
    await pruneTelemetry(db).catch((error: unknown) =>
      console.error("[telemetry] prune failed:", error),
    );
  }
  return noContent();
}

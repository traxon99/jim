import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { NextResponse } from "next/server";

// Shared by the server-data API routes (#553), which each kept a copy.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function unauthenticated() {
  return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
}

/** The 401 for a signed-out caller; anything else is a real failure and rethrows. */
export function unauthenticatedOrThrow(error: unknown) {
  if (error instanceof UnauthenticatedError) return unauthenticated();
  throw error;
}

/** A JSON object body, or null when the body isn't valid JSON or isn't an object. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Any JSON body, kept apart from "not JSON at all" so a route can answer 400. */
export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

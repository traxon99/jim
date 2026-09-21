import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import { type ApplyResult, applyMutation } from "@/lib/sync/apply-mutation";
import { type Mutation, SYNC_TABLES } from "@jim/core";
import { NextResponse } from "next/server";

function isMutation(value: unknown): value is Mutation {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.table === "string" &&
    (SYNC_TABLES as readonly string[]).includes(candidate.table) &&
    typeof candidate.entity === "object" &&
    candidate.entity !== null
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mutations = (body as { mutations?: unknown } | null)?.mutations;
  if (!Array.isArray(mutations) || !mutations.every(isMutation)) {
    return NextResponse.json({ error: "Expected { mutations: Mutation[] }" }, { status: 400 });
  }

  try {
    const results = await withUserDb(async (tx, userId) => {
      const out: { id: string; status: ApplyResult }[] = [];
      // Sequential, not Promise.all: mutations for the same entity must
      // apply in outbox order, and each runs in its own SAVEPOINT anyway.
      for (const mutation of mutations) {
        const status = await applyMutation(tx, userId, mutation);
        out.push({ id: mutation.id, status });
      }
      return out;
    });

    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    throw error;
  }
}

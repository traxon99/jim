import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import { type ApplyResult, applyMutation } from "@/lib/sync/apply-mutation";
import { type Mutation, SYNC_TABLES } from "@jim/core";
import { syncMutations } from "@jim/db";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Most mutations one push may carry (issue #536). The app sends batches of
 * `PUSH_BATCH_SIZE` (200); this leaves room without letting one request run
 * unbounded inside a single transaction.
 */
export const MAX_PUSH_MUTATIONS = 500;
/** Largest single entity, as JSON. A set, routine or note is well under a kilobyte. */
export const MAX_ENTITY_BYTES = 64 * 1024;
/**
 * How long a mutation id stays in the idempotency ledger. A retry after this
 * long re-applies, which last-write-wins and set ids make harmless.
 */
const LEDGER_RETENTION_DAYS = 180;
const LEDGER_PRUNE_BATCH = 1000;

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
  if (mutations.length > MAX_PUSH_MUTATIONS) {
    return NextResponse.json(
      { error: `At most ${MAX_PUSH_MUTATIONS} mutations per push` },
      { status: 413 },
    );
  }
  const oversized = mutations.find(
    (mutation) => JSON.stringify(mutation.entity).length > MAX_ENTITY_BYTES,
  );
  if (oversized) {
    return NextResponse.json({ error: `Mutation ${oversized.id} is too large` }, { status: 413 });
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
      // Keep the idempotency ledger from growing forever (issue #536).
      const old = tx
        .select({ id: syncMutations.id })
        .from(syncMutations)
        .where(
          and(
            eq(syncMutations.userId, userId),
            lt(
              syncMutations.appliedAt,
              sql`now() - make_interval(days => ${LEDGER_RETENTION_DAYS})`,
            ),
          ),
        )
        .limit(LEDGER_PRUNE_BATCH);
      await tx.delete(syncMutations).where(inArray(syncMutations.id, old));
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

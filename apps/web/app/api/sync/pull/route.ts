import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import {
  type DbOrTx,
  bodyMeasurements,
  dprBlockLifts,
  dprBlocks,
  exercises,
  gyms,
  personalRecords,
  programRoutines,
  programs,
  routineExercises,
  routines,
  scheduledWorkouts,
  sessionExercises,
  sessions,
  sets,
} from "@jim/db";
import { gt } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { NextResponse } from "next/server";

// `exercises` and `scheduledWorkouts` are pull-only (the read-only seed
// catalog, and rows the MCP server writes — see @jim/core's SYNC_TABLES,
// which push uses and deliberately excludes both).
const PULL_TABLES = [
  ["routines", routines, routines.serverSeq],
  ["routineExercises", routineExercises, routineExercises.serverSeq],
  ["sessions", sessions, sessions.serverSeq],
  ["sessionExercises", sessionExercises, sessionExercises.serverSeq],
  ["sets", sets, sets.serverSeq],
  ["personalRecords", personalRecords, personalRecords.serverSeq],
  ["bodyMeasurements", bodyMeasurements, bodyMeasurements.serverSeq],
  ["exercises", exercises, exercises.serverSeq],
  ["programs", programs, programs.serverSeq],
  ["programRoutines", programRoutines, programRoutines.serverSeq],
  ["dprBlocks", dprBlocks, dprBlocks.serverSeq],
  ["dprBlockLifts", dprBlockLifts, dprBlockLifts.serverSeq],
  ["gyms", gyms, gyms.serverSeq],
  ["scheduledWorkouts", scheduledWorkouts, scheduledWorkouts.serverSeq],
] as const;

/**
 * Rows per table per pull (issue #489). A first pull after sign-in starts at
 * 0 and would otherwise return the whole history at once, past Vercel's
 * response size limit; the client keeps pulling while `hasMore` is set.
 */
const PULL_PAGE_SIZE = 500;

async function pullTable(
  tx: DbOrTx,
  table: PgTable,
  serverSeq: PgColumn,
  since: number,
  limit: number,
) {
  return tx.select().from(table).where(gt(serverSeq, since)).orderBy(serverSeq).limit(limit);
}

const seqOf = (row: unknown) => (row as { serverSeq: number }).serverSeq;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sinceParam = url.searchParams.get("since") ?? "0";
  const since = Number(sinceParam);
  if (!Number.isInteger(since) || since < 0) {
    return NextResponse.json({ error: "since must be a non-negative integer" }, { status: 400 });
  }
  const limitParam = Number(url.searchParams.get("limit") ?? PULL_PAGE_SIZE);
  const limit =
    Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, PULL_PAGE_SIZE)
      : PULL_PAGE_SIZE;

  try {
    const result = await withUserDb(
      async (tx) => {
        const changes: Record<string, unknown[]> = {};
        // The new cursor is the highest server_seq this user actually saw —
        // not the sequence's own current value, which could include rows from
        // other users (invisible under RLS). Holding the user's lock
        // exclusively (issue #488, see runAsUser) means none of this user's
        // writes is still in flight, so no lower seq can commit after this
        // pull and be skipped, and every table is read from the same state.
        let cursor = since;
        // A table that filled its page may have more rows past its last
        // seq, so this page stops at the lowest such seq across tables:
        // everything at or below it has been read from every table, and
        // nothing above it is returned yet, so the cursor never skips a row.
        let cutoff = Number.POSITIVE_INFINITY;

        for (const [name, table, serverSeq] of PULL_TABLES) {
          const rows = await pullTable(tx, table, serverSeq, since, limit);
          changes[name] = rows;
          const last = rows.at(-1);
          if (rows.length === limit && last) cutoff = Math.min(cutoff, seqOf(last));
        }

        const hasMore = cutoff !== Number.POSITIVE_INFINITY;
        for (const name of Object.keys(changes)) {
          const rows = hasMore
            ? (changes[name] ?? []).filter((row) => seqOf(row) <= cutoff)
            : (changes[name] ?? []);
          changes[name] = rows;
          for (const row of rows) cursor = Math.max(cursor, seqOf(row));
        }

        return { cursor, hasMore, changes };
      },
      { exclusive: true },
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    throw error;
  }
}

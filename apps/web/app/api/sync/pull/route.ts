import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import {
  type DbOrTx,
  bodyMeasurements,
  exercises,
  personalRecords,
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
  ["scheduledWorkouts", scheduledWorkouts, scheduledWorkouts.serverSeq],
] as const;

async function pullTable(tx: DbOrTx, table: PgTable, serverSeq: PgColumn, since: number) {
  return tx.select().from(table).where(gt(serverSeq, since)).orderBy(serverSeq);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sinceParam = url.searchParams.get("since") ?? "0";
  const since = Number(sinceParam);
  if (!Number.isInteger(since) || since < 0) {
    return NextResponse.json({ error: "since must be a non-negative integer" }, { status: 400 });
  }

  try {
    const result = await withUserDb(async (tx) => {
      const changes: Record<string, unknown[]> = {};
      // The new cursor is the highest server_seq this user actually saw —
      // not the sequence's own current value, which could include rows from
      // other users (invisible under RLS) or rows from a still-in-flight
      // concurrent transaction that hasn't committed yet. Advancing past
      // those would skip them on every future pull. Rows from the same
      // user's own concurrent pushes are the one gap this doesn't close;
      // acceptable for now given how rarely that overlaps in practice
      // (ADR-003: one person, one phone, one workout at a time).
      let cursor = since;

      for (const [name, table, serverSeq] of PULL_TABLES) {
        const rows = await pullTable(tx, table, serverSeq, since);
        changes[name] = rows;
        for (const row of rows) {
          const seq = (row as { serverSeq: number }).serverSeq;
          if (seq > cursor) cursor = seq;
        }
      }

      return { cursor, changes };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    throw error;
  }
}

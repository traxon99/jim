"use client";

import { db } from "@/lib/db/schema";
import { useLiveQuery } from "dexie-react-hooks";
import { buildSessionListEntries } from "./session-list-entries";

/**
 * The finished-session list Home and History both show (#556): one live
 * query over the tables it reads, with the rows it was built from for
 * screens that need more than the entries. Undefined while loading.
 */
export function useSessionList() {
  return useLiveQuery(async () => {
    const [sessions, sessionExercises, exercises, sets, personalRecords] = await Promise.all([
      db.sessions.toArray(),
      db.sessionExercises.toArray(),
      db.exercises.toArray(),
      db.sets.toArray(),
      db.personalRecords.toArray(),
    ]);
    return {
      entries: buildSessionListEntries(
        sessions,
        sessionExercises,
        exercises,
        sets,
        personalRecords,
      ),
      sessions,
      sessionExercises,
      exercises,
      sets,
    };
  }, []);
}

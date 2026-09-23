"use client";

import { db } from "@/lib/db/schema";
import { useLiveQuery } from "dexie-react-hooks";

/** True while a workout session is in progress (not yet ended, not deleted). */
export function useHasActiveSession(): boolean {
  const activeCount = useLiveQuery(
    () => db.sessions.filter((session) => !session.endedAt && !session.deletedAt).count(),
    [],
  );
  return (activeCount ?? 0) > 0;
}

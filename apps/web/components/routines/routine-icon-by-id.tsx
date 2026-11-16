"use client";

import { Hourglass } from "@/components/icons/solar";
import { db } from "@/lib/db/schema";
import { useLiveQuery } from "dexie-react-hooks";
import { RoutineIcon } from "./routine-icon";

/**
 * The icon for a routine known only by id — e.g. a session started from a
 * routine (sessions.routineId), so the routine's icon follows its name into
 * the workout, summary and history (issue #154). Renders nothing for a
 * freestyle session or while the routine row isn't in Dexie; a deleted
 * routine keeps its icon, same as the session keeps its name.
 */
export function RoutineIconById({
  routineId,
  className,
}: {
  routineId: string | null | undefined;
  className?: string;
}) {
  const routine = useLiveQuery(
    () => (routineId ? db.routines.get(routineId) : undefined),
    [routineId],
  );
  if (!routine) return null;
  // A one-off workout (issue #798) shows its hourglass instead.
  if (routine.oneOff) return <Hourglass className={className} strokeWidth={2} aria-hidden="true" />;
  return <RoutineIcon shape={routine.iconShape} color={routine.iconColor} className={className} />;
}

"use client";

import { Hourglass } from "@/components/icons/solar";
import { db } from "@/lib/db/schema";
import { useLiveQuery } from "dexie-react-hooks";
import { RoutineIcon, RoutineIconTile } from "./routine-icon";

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

/** {@link RoutineIconById} on its colored tile, beside a screen title (#854). */
export function RoutineIconTileById({
  routineId,
  size = "lg",
}: {
  routineId: string | null | undefined;
  size?: "md" | "lg";
}) {
  const routine = useLiveQuery(
    () => (routineId ? db.routines.get(routineId) : undefined),
    [routineId],
  );
  if (!routine) return null;
  if (routine.oneOff) {
    return (
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center bg-zinc-200/70 dark:bg-zinc-800 ${
          size === "lg" ? "h-11 w-11 rounded-xl" : "h-8 w-8 rounded-[10px]"
        }`}
      >
        <Hourglass className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} strokeWidth={2} />
      </span>
    );
  }
  return <RoutineIconTile shape={routine.iconShape} color={routine.iconColor} size={size} />;
}

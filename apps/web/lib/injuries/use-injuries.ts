"use client";

import { type InjuryRow, type PainCheckinRow, db } from "@/lib/db/schema";
import { useToday } from "@/lib/pwa/use-today";
import { dayKey, isInjuryOpenOn } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";

export interface InjuryData {
  /** Every live injury, open and healed. */
  injuries: InjuryRow[];
  /** Every live pain check-in. */
  checkins: PainCheckinRow[];
}

/** Live injuries and pain check-ins (issue #627); undefined while loading. */
export function useInjuries(): InjuryData | undefined {
  return useLiveQuery(async () => {
    const [injuries, checkins] = await Promise.all([
      db.injuries.toArray(),
      db.painCheckins.toArray(),
    ]);
    return {
      injuries: injuries.filter((row) => !row.deletedAt),
      checkins: checkins.filter((row) => !row.deletedAt),
    };
  }, []);
}

/** Today's local day as YYYY-MM-DD, moving on at midnight and on resume (#523). */
export function useTodayKey(): string {
  const today = useToday();
  return useMemo(() => dayKey(today), [today]);
}

/**
 * Whether any injury is open today: the pre-workout sheet then opens before
 * every routine start, to host the pain check-in (issue #627).
 */
export function useHasOpenInjury(): boolean {
  const data = useInjuries();
  const today = useTodayKey();
  return (data?.injuries ?? []).some((injury) => isInjuryOpenOn(injury, today));
}

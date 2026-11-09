"use client";

import { db } from "@/lib/db/schema";
import { sickDayKeys } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";

/** The user's sick days (issue #779) as a set of YYYY-MM-DD keys; undefined while loading. */
export function useSickDays(): ReadonlySet<string> | undefined {
  const rows = useLiveQuery(() => db.sickDays.toArray(), []);
  return useMemo(() => (rows ? new Set(sickDayKeys(rows)) : undefined), [rows]);
}

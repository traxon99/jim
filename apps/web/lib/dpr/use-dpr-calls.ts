"use client";

import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { type DprContext, buildDprContext } from "./calls";
import { defaultRepRange, loadDprSnapshot } from "./data";

/**
 * Live DPR context for a screen (issue #212): re-derives as sets, routines,
 * blocks or settings change. Null when DPR is off, no block is running, or
 * the data is still loading — callers render no DPR UI then. Pass the
 * result to `dprCallFor` / `dprCallsForRoutine` rather than calling this
 * hook per exercise, since it reads the whole training history.
 */
export function useDprContext(): DprContext | null {
  const cached = useLiveQuery(() => db.settings.get("me"), []);
  const settings = cached ?? DEFAULT_SETTINGS;
  const enabled = settings.dprEnabled;
  const data = useLiveQuery(async () => {
    if (!enabled) return null;
    const [blocks, lifts, exercises, snapshot] = await Promise.all([
      db.dprBlocks.toArray(),
      db.dprBlockLifts.toArray(),
      db.exercises.toArray(),
      loadDprSnapshot(db, defaultRepRange(settings)),
    ]);
    return { blocks, lifts, exercises, snapshot };
  }, [enabled, settings.dprDefaultRepLow, settings.dprDefaultRepHigh]);

  return useMemo(() => {
    if (!cached || !data) return null;
    return buildDprContext({ settings: cached, ...data, now: new Date() });
  }, [cached, data]);
}

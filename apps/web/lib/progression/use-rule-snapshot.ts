"use client";

import { db } from "@/lib/db/schema";
import { defaultRepRange, loadDprSnapshot } from "@/lib/dpr/data";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import type { DprSnapshot } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";

/**
 * The training history custom progression rules (issue #255) replay, read
 * only while `needed` (some exercise on screen has a rule). Pass DPR's own
 * snapshot as `shared` when DPR already loaded one, to skip a second read.
 */
export function useRuleSnapshot(needed: boolean, shared: DprSnapshot | null): DprSnapshot | null {
  const own = useLiveQuery(async () => {
    if (!needed || shared) return null;
    return loadDprSnapshot(db, defaultRepRange(DEFAULT_SETTINGS));
  }, [needed, shared === null]);
  return shared ?? own ?? null;
}

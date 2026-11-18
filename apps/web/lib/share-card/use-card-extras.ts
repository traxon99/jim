"use client";

import { bodyweightLookup } from "@/lib/bodyweight";
import { db } from "@/lib/db/schema";
import { useFriends } from "@/lib/friends/use-friends";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import type { CardExtras } from "./build";

/**
 * Where to find a card's routine color: a routine directly, or the workout
 * it was done in (a PR or achievement earned in a session takes that
 * workout's routine color).
 */
export interface CardExtrasKey {
  routineId?: string | null;
  sessionId?: string | null;
  /** The card's date, for the bodyweight that applied then. */
  on: Date;
}

/**
 * Reads what a card needs from the local database (IndexedDB first, so a card
 * can be made offline) and the signed-in user's username (server data, null
 * while offline). Undefined until the local lookups have loaded.
 */
export function useCardExtras({ routineId, sessionId, on }: CardExtrasKey): CardExtras | undefined {
  const { load } = useFriends();
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const measurements = useLiveQuery(() => db.bodyMeasurements.toArray(), []);
  const color = useLiveQuery(async () => {
    let id = routineId ?? null;
    if (!id && sessionId) id = (await db.sessions.get(sessionId))?.routineId ?? null;
    const routine = id ? await db.routines.get(id) : undefined;
    return { value: routine?.iconColor ?? null };
  }, [routineId, sessionId]);

  const dayMs = on.getTime();
  return useMemo(() => {
    if (!color || !measurements) return undefined;
    const logged = bodyweightLookup(measurements, settings.units)(new Date(dayMs));
    const profile = Number(settings.bodyweight);
    const fallback = Number.isFinite(profile) && profile > 0 ? profile : null;
    return {
      username: load.status === "ready" ? load.username : null,
      routineColor: color.value,
      bodyweight: logged ?? fallback,
    };
  }, [color, measurements, settings.units, settings.bodyweight, load, dayMs]);
}

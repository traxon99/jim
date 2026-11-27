"use client";

import { type GymCardRow, db } from "@/lib/db/schema";
import { sortGymCards } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";

/** Live gym cards in their order (issue #878); undefined while loading. */
export function useGymCards(): GymCardRow[] | undefined {
  return useLiveQuery(async () => sortGymCards(await db.gymCards.toArray()), []);
}

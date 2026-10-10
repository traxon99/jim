"use client";

import { type GymRow, db } from "@/lib/db/schema";
import { useLiveQuery } from "dexie-react-hooks";
import { sortGyms } from "./index";

/** Live gyms, home gym first (see `sortGyms`); undefined while loading. */
export function useGyms(): GymRow[] | undefined {
  return useLiveQuery(async () => sortGyms(await db.gyms.toArray()), []);
}

import { type GymRow, type JimDatabase, db } from "@/lib/db/schema";
import { type GymInput, addGym, setDefaultGym } from "@/lib/gyms";

/**
 * Adds the gym named in setup and makes it home. `created` remembers the gym once it's saved, so
 * a retry after `setDefaultGym` fails only repeats that step instead of adding a second gym.
 */
export async function saveSetupGym(
  input: GymInput & { userId: string },
  created: { current: GymRow | null },
  database: JimDatabase = db,
  makeDefault: typeof setDefaultGym = setDefaultGym,
): Promise<void> {
  if (!created.current) created.current = await addGym(input, database);
  // A gym added here is the one they named as home.
  if (!created.current.isDefault) await makeDefault(created.current.id, database);
  created.current = null;
}

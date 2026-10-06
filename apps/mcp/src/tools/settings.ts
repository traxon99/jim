import { users } from "@jim/db";
import { eq } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser, withUserWrite } from "../context.js";

type UserRow = typeof users.$inferSelect;

/** The settings the phone's Settings and Profile screens edit, in the shape update_settings accepts. */
function toSettings(row: UserRow) {
  return {
    units: row.units,
    defaultBarWeight: Number(row.defaultBarWeight),
    availablePlates: row.availablePlates.map(Number),
    defaultRestSeconds: row.defaultRestSeconds,
    weekStart: row.weekStart,
    colorScheme: row.colorScheme,
    accentColor: row.accentColor,
    fontFamily: row.fontFamily,
    cardStyle: row.cardStyle,
    showPaceTracker: row.showPaceTracker,
    sex: row.sex,
    birthdate: row.birthdate,
    heightCm: row.heightCm == null ? null : Number(row.heightCm),
    bodyweight: row.bodyweight == null ? null : Number(row.bodyweight),
    dprEnabled: row.dprEnabled,
    dprAggressiveness: row.dprAggressiveness,
    dprExperience: row.dprExperience,
    dprDefaultRepLow: row.dprDefaultRepLow,
    dprDefaultRepHigh: row.dprDefaultRepHigh,
  };
}

export type Settings = ReturnType<typeof toSettings>;

async function readUser(tx: Parameters<Parameters<typeof withUser>[1]>[0], userId: string) {
  const [row] = await tx.select().from(users).where(eq(users.id, userId));
  if (!row) throw new Error("No settings yet: open the app once to finish setting up.");
  return row;
}

export async function getSettings(context: UserContext) {
  return withUser(context, async (tx) => toSettings(await readUser(tx, context.userId)));
}

export type UpdateSettingsInput = Partial<Settings> & { dryRun?: boolean };

/**
 * Patches settings the way the phone's PATCH /api/settings does. Changing
 * `units` only changes how weights are shown and entered; logged sets keep
 * the unit they were logged in. The phone reads settings once per launch, so
 * a change shows there the next time the app is opened fresh.
 */
export async function updateSettings(context: UserContext, input: UpdateSettingsInput) {
  const { dryRun, ...patch } = input;
  const low = patch.dprDefaultRepLow;
  const high = patch.dprDefaultRepHigh;
  return withUserWrite(context, dryRun ?? false, async (tx) => {
    const current = await readUser(tx, context.userId);
    if ((low ?? current.dprDefaultRepLow) > (high ?? current.dprDefaultRepHigh)) {
      throw new Error("dprDefaultRepLow can't be above dprDefaultRepHigh.");
    }
    const values: Partial<typeof users.$inferInsert> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      if (key === "defaultBarWeight") values.defaultBarWeight = String(value);
      else if (key === "availablePlates") values.availablePlates = (value as number[]).map(String);
      else if (key === "heightCm" || key === "bodyweight") {
        values[key] = value === null ? null : String(value);
      } else (values as Record<string, unknown>)[key] = value;
    }
    if (Object.keys(values).length === 0) throw new Error("Nothing to change.");
    const [row] = await tx
      .update(users)
      .set(values)
      .where(eq(users.id, context.userId))
      .returning();
    if (!row) throw new Error("Settings row disappeared mid-update");
    return { settings: toSettings(row), changed: Object.keys(values) };
  });
}

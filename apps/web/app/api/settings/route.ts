import { ensureUserRow } from "@/lib/db/ensure-user-row";
import { UnauthenticatedError, withUserDb } from "@/lib/db/user-scoped";
import { users } from "@jim/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const UNITS = new Set(["lb", "kg"]);
const COLOR_SCHEMES = new Set(["system", "light", "dark"]);
const ACCENT_COLORS = new Set(["zinc", "blue", "green", "purple", "orange", "rose"]);
const FONT_FAMILIES = new Set(["sans", "serif", "mono"]);
const SEXES = new Set(["male", "female"]);
const DPR_AGGRESSIVENESS = new Set(["conservative", "moderate", "aggressive"]);
const DPR_EXPERIENCE = new Set(["novice", "intermediate", "advanced"]);
const DPR_EQUIPMENT_BUCKETS = new Set([
  "barbell",
  "ez-bar",
  "dumbbell",
  "machine",
  "cable",
  "kettlebell",
  "other",
]);
const BIRTHDATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface SettingsPayload {
  units: "lb" | "kg";
  defaultBarWeight: string;
  availablePlates: string[];
  defaultRestSeconds: number;
  weekStart: number;
  colorScheme: "system" | "light" | "dark";
  accentColor: "zinc" | "blue" | "green" | "purple" | "orange" | "rose";
  fontFamily: "sans" | "serif" | "mono";
  showPaceTracker: boolean;
  sex: "male" | "female" | null;
  birthdate: string | null;
  heightCm: string | null;
  bodyweight: string | null;
  dprEnabled: boolean;
  dprAggressiveness: "conservative" | "moderate" | "aggressive";
  dprExperience: "novice" | "intermediate" | "advanced" | null;
  dprEquipmentIncrements: Record<string, Record<string, number>>;
  dprDefaultRepLow: number;
  dprDefaultRepHigh: number;
  dprPromptDismissedAt: string | null;
}

function toPayload(row: typeof users.$inferSelect): SettingsPayload {
  return {
    units: row.units,
    defaultBarWeight: row.defaultBarWeight,
    availablePlates: row.availablePlates,
    defaultRestSeconds: row.defaultRestSeconds,
    weekStart: row.weekStart,
    colorScheme: row.colorScheme,
    accentColor: row.accentColor,
    fontFamily: row.fontFamily,
    showPaceTracker: row.showPaceTracker,
    sex: row.sex,
    birthdate: row.birthdate,
    heightCm: row.heightCm,
    bodyweight: row.bodyweight,
    dprEnabled: row.dprEnabled,
    dprAggressiveness: row.dprAggressiveness,
    dprExperience: row.dprExperience,
    dprEquipmentIncrements: row.dprEquipmentIncrements,
    dprDefaultRepLow: row.dprDefaultRepLow,
    dprDefaultRepHigh: row.dprDefaultRepHigh,
    dprPromptDismissedAt: row.dprPromptDismissedAt?.toISOString() ?? null,
  };
}

export async function GET() {
  try {
    const payload = await withUserDb(async (tx, userId, email) => {
      const row = await ensureUserRow(tx, userId, email);
      return toPayload(row);
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    throw error;
  }
}

function isValidPatch(body: unknown): body is Partial<SettingsPayload> {
  if (typeof body !== "object" || body === null) return false;
  const candidate = body as Record<string, unknown>;

  if ("units" in candidate && !UNITS.has(candidate.units as string)) return false;
  if ("defaultBarWeight" in candidate) {
    const n = Number(candidate.defaultBarWeight);
    if (!Number.isFinite(n) || n <= 0) return false;
  }
  if ("availablePlates" in candidate) {
    if (!Array.isArray(candidate.availablePlates) || candidate.availablePlates.length === 0) {
      return false;
    }
    // Accepts numeric strings too — that's the shape the client's own cached
    // settings row uses (Postgres numeric round-trips as a string), and
    // rejecting it was how the old profile form's Save hit "Invalid settings
    // payload".
    const allPositive = candidate.availablePlates.every((p) => {
      if (typeof p !== "number" && typeof p !== "string") return false;
      const n = Number(p);
      return p !== "" && Number.isFinite(n) && n > 0;
    });
    if (!allPositive) return false;
  }
  if ("defaultRestSeconds" in candidate) {
    const n = candidate.defaultRestSeconds;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return false;
  }
  if ("weekStart" in candidate) {
    const n = candidate.weekStart;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 6) return false;
  }
  if ("colorScheme" in candidate && !COLOR_SCHEMES.has(candidate.colorScheme as string)) {
    return false;
  }
  if ("accentColor" in candidate && !ACCENT_COLORS.has(candidate.accentColor as string)) {
    return false;
  }
  if ("fontFamily" in candidate && !FONT_FAMILIES.has(candidate.fontFamily as string)) {
    return false;
  }
  if ("showPaceTracker" in candidate && typeof candidate.showPaceTracker !== "boolean") {
    return false;
  }
  if ("sex" in candidate && candidate.sex !== null && !SEXES.has(candidate.sex as string)) {
    return false;
  }
  if (
    "birthdate" in candidate &&
    candidate.birthdate !== null &&
    (typeof candidate.birthdate !== "string" || !BIRTHDATE_PATTERN.test(candidate.birthdate))
  ) {
    return false;
  }
  if ("heightCm" in candidate && candidate.heightCm !== null) {
    const n = Number(candidate.heightCm);
    if (!Number.isFinite(n) || n <= 0) return false;
  }
  if ("bodyweight" in candidate && candidate.bodyweight !== null) {
    const n = Number(candidate.bodyweight);
    if (!Number.isFinite(n) || n <= 0) return false;
  }
  if ("dprEnabled" in candidate && typeof candidate.dprEnabled !== "boolean") return false;
  if (
    "dprAggressiveness" in candidate &&
    !DPR_AGGRESSIVENESS.has(candidate.dprAggressiveness as string)
  ) {
    return false;
  }
  if (
    "dprExperience" in candidate &&
    candidate.dprExperience !== null &&
    !DPR_EXPERIENCE.has(candidate.dprExperience as string)
  ) {
    return false;
  }
  if (
    "dprEquipmentIncrements" in candidate &&
    !isValidIncrements(candidate.dprEquipmentIncrements)
  ) {
    return false;
  }
  for (const key of ["dprDefaultRepLow", "dprDefaultRepHigh"] as const) {
    if (key in candidate) {
      const n = candidate[key];
      if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 100) return false;
    }
  }
  if (
    typeof candidate.dprDefaultRepLow === "number" &&
    typeof candidate.dprDefaultRepHigh === "number" &&
    candidate.dprDefaultRepLow > candidate.dprDefaultRepHigh
  ) {
    return false;
  }
  if ("dprPromptDismissedAt" in candidate && candidate.dprPromptDismissedAt !== null) {
    const value = candidate.dprPromptDismissedAt;
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return false;
  }
  return true;
}

/** `{ [bucket]: { lb?: n, kg?: n } }` with known buckets and positive steps. */
function isValidIncrements(value: unknown): value is Record<string, Record<string, number>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  for (const [bucket, steps] of Object.entries(value)) {
    if (!DPR_EQUIPMENT_BUCKETS.has(bucket)) return false;
    if (typeof steps !== "object" || steps === null || Array.isArray(steps)) return false;
    for (const [unit, step] of Object.entries(steps)) {
      if (unit !== "lb" && unit !== "kg") return false;
      if (typeof step !== "number" || !Number.isFinite(step) || step <= 0) return false;
    }
  }
  return true;
}

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidPatch(body)) {
    return NextResponse.json({ error: "Invalid settings payload" }, { status: 400 });
  }

  try {
    const payload = await withUserDb(async (tx, userId, email) => {
      await ensureUserRow(tx, userId, email);

      const patch: Partial<typeof users.$inferInsert> = {};
      if (body.units !== undefined) patch.units = body.units;
      if (body.defaultBarWeight !== undefined) {
        patch.defaultBarWeight = String(body.defaultBarWeight);
      }
      if (body.availablePlates !== undefined) {
        patch.availablePlates = body.availablePlates.map(String);
      }
      if (body.defaultRestSeconds !== undefined) patch.defaultRestSeconds = body.defaultRestSeconds;
      if (body.weekStart !== undefined) patch.weekStart = body.weekStart;
      if (body.colorScheme !== undefined) patch.colorScheme = body.colorScheme;
      if (body.accentColor !== undefined) patch.accentColor = body.accentColor;
      if (body.fontFamily !== undefined) patch.fontFamily = body.fontFamily;
      if (body.showPaceTracker !== undefined) patch.showPaceTracker = body.showPaceTracker;
      if (body.sex !== undefined) patch.sex = body.sex;
      if (body.birthdate !== undefined) patch.birthdate = body.birthdate;
      if (body.heightCm !== undefined) {
        patch.heightCm = body.heightCm === null ? null : String(body.heightCm);
      }
      if (body.bodyweight !== undefined) {
        patch.bodyweight = body.bodyweight === null ? null : String(body.bodyweight);
      }
      if (body.dprEnabled !== undefined) patch.dprEnabled = body.dprEnabled;
      if (body.dprAggressiveness !== undefined) patch.dprAggressiveness = body.dprAggressiveness;
      if (body.dprExperience !== undefined) patch.dprExperience = body.dprExperience;
      if (body.dprEquipmentIncrements !== undefined) {
        patch.dprEquipmentIncrements = body.dprEquipmentIncrements;
      }
      if (body.dprDefaultRepLow !== undefined) patch.dprDefaultRepLow = body.dprDefaultRepLow;
      if (body.dprDefaultRepHigh !== undefined) patch.dprDefaultRepHigh = body.dprDefaultRepHigh;
      if (body.dprPromptDismissedAt !== undefined) {
        patch.dprPromptDismissedAt =
          body.dprPromptDismissedAt === null ? null : new Date(body.dprPromptDismissedAt);
      }

      const [row] = await tx.update(users).set(patch).where(eq(users.id, userId)).returning();
      if (!row) throw new Error("Settings row disappeared mid-update");
      return toPayload(row);
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    throw error;
  }
}

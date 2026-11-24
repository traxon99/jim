import {
  AUTO_END_OPTIONS,
  DEFAULT_INCREMENTS,
  type EquipmentBucket,
  normalizeDecimalInput,
} from "@jim/core";
import type { SettingsPayload } from "@jim/db/admin";

/**
 * The settings the admin user page edits (issue #807), grouped like the app's
 * Settings screens. Each field saves on its own through the same validator as
 * PATCH /api/settings. Left out: the phone-reported time zone and the
 * dismissed-prompt / onboarding stamps, which the app manages itself.
 */
export type SettingsField =
  | { key: keyof SettingsPayload; label: string; kind: "toggle" }
  | {
      key: keyof SettingsPayload;
      label: string;
      kind: "select";
      options: { value: string | number | null; label: string }[];
    }
  | { key: keyof SettingsPayload; label: string; kind: "number"; integer?: boolean }
  | { key: keyof SettingsPayload; label: string; kind: "text"; placeholder?: string }
  | { key: "availablePlates"; label: string; kind: "plates" }
  | { key: "dprEquipmentIncrements"; label: string; kind: "step"; bucket: EquipmentBucket };

export interface SettingsGroup {
  id: string;
  label: string;
  fields: SettingsField[];
}

/** The PRP weight steps, as Settings → Advanced → PRP lists them. */
const STEP_LABELS: Record<EquipmentBucket, string> = {
  barbell: "Barbell",
  "ez-bar": "EZ bar",
  dumbbell: "Dumbbell",
  machine: "Machine",
  cable: "Cable",
  kettlebell: "Kettlebell",
  other: "Other",
};

/** A field's own id: the settings key, or the key plus bucket for a weight step. */
export function fieldId(field: SettingsField): string {
  return field.kind === "step" ? `${field.key}:${field.bucket}` : field.key;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const ADMIN_SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "workout",
    label: "Workout",
    fields: [
      {
        key: "units",
        label: "Units",
        kind: "select",
        options: [
          { value: "lb", label: "lb" },
          { value: "kg", label: "kg" },
        ],
      },
      { key: "defaultBarWeight", label: "Bar weight", kind: "number" },
      { key: "availablePlates", label: "Plates", kind: "plates" },
      { key: "defaultRestSeconds", label: "Default rest (s)", kind: "number", integer: true },
      {
        key: "weekStart",
        label: "Week starts",
        kind: "select",
        options: WEEKDAYS.map((day, index) => ({ value: index, label: day })),
      },
      {
        key: "weeklyWorkoutGoal",
        label: "Weekly goal",
        kind: "select",
        options: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) })),
      },
      {
        key: "autoEndWorkoutMinutes",
        label: "End idle workouts",
        kind: "select",
        options: [
          { value: null, label: "Off" },
          ...AUTO_END_OPTIONS.map((minutes) => ({ value: minutes, label: `${minutes} min` })),
        ],
      },
    ],
  },
  {
    id: "advanced",
    label: "Advanced",
    fields: [
      { key: "advancedFeatures", label: "Advanced features", kind: "toggle" },
      { key: "showRpe", label: "RPE", kind: "toggle" },
      { key: "showPaceTracker", label: "Pace tracker", kind: "toggle" },
      { key: "showStrengthHints", label: "Strength hints", kind: "toggle" },
      { key: "showSetTypes", label: "Set types", kind: "toggle" },
      { key: "showRestStats", label: "Rest stats", kind: "toggle" },
      { key: "showSetTimer", label: "Set timer", kind: "toggle" },
      { key: "showTempo", label: "Tempo", kind: "toggle" },
      { key: "tempoCues", label: "Tempo cues", kind: "toggle" },
      { key: "tempoCountReps", label: "Count reps", kind: "toggle" },
      {
        key: "tempoCueStyle",
        label: "Tempo cue style",
        kind: "select",
        options: [
          { value: "voice", label: "Voice" },
          { value: "sounds", label: "Sounds" },
        ],
      },
      { key: "showInjuryRules", label: "Injury exercise rules", kind: "toggle" },
      { key: "injuriesAffectPrp", label: "Injuries adjust PRP", kind: "toggle" },
      { key: "showInjuryHints", label: "Injury suggestions", kind: "toggle" },
    ],
  },
  {
    id: "prp",
    label: "PRP",
    fields: [
      { key: "dprEnabled", label: "PRP", kind: "toggle" },
      {
        key: "dprAggressiveness",
        label: "Aggressiveness",
        kind: "select",
        options: [
          { value: "conservative", label: "Conservative" },
          { value: "moderate", label: "Moderate" },
          { value: "aggressive", label: "Aggressive" },
        ],
      },
      {
        key: "dprExperience",
        label: "Experience",
        kind: "select",
        options: [
          { value: null, label: "Not set" },
          { value: "novice", label: "Novice" },
          { value: "intermediate", label: "Intermediate" },
          { value: "advanced", label: "Advanced" },
        ],
      },
      { key: "dprDefaultRepLow", label: "Rep range low", kind: "number", integer: true },
      { key: "dprDefaultRepHigh", label: "Rep range high", kind: "number", integer: true },
      ...(Object.entries(STEP_LABELS) as [EquipmentBucket, string][]).map(
        ([bucket, label]): SettingsField => ({
          key: "dprEquipmentIncrements",
          label: `${label} step`,
          kind: "step",
          bucket,
        }),
      ),
    ],
  },
  {
    id: "appearance",
    label: "Appearance",
    fields: [
      {
        key: "colorScheme",
        label: "Theme",
        kind: "select",
        options: [
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ],
      },
      {
        key: "accentColor",
        label: "Accent",
        kind: "select",
        options: ["zinc", "blue", "green", "purple", "orange", "rose", "pink"].map((color) => ({
          value: color,
          label: color === "zinc" ? "Default" : color[0]?.toUpperCase() + color.slice(1),
        })),
      },
      {
        key: "fontFamily",
        label: "Font",
        kind: "select",
        options: [
          { value: "sans", label: "Sans" },
          { value: "serif", label: "Serif" },
          { value: "mono", label: "Mono" },
        ],
      },
      {
        key: "cardStyle",
        label: "Cards",
        kind: "select",
        options: [
          { value: "plain", label: "Plain" },
          { value: "glass", label: "Glass" },
        ],
      },
    ],
  },
  {
    id: "notifications",
    label: "Notifications",
    fields: [
      { key: "pushRestTimer", label: "Rest timer", kind: "toggle" },
      { key: "pushWorkoutReminders", label: "Workout reminders", kind: "toggle" },
      { key: "pushWhatsNew", label: "What's new", kind: "toggle" },
      { key: "pushWhatsNewEveryDeploy", label: "Every update", kind: "toggle" },
    ],
  },
  {
    id: "body",
    label: "Body",
    fields: [
      {
        key: "sex",
        label: "Sex",
        kind: "select",
        options: [
          { value: null, label: "Not set" },
          { value: "male", label: "Male" },
          { value: "female", label: "Female" },
        ],
      },
      { key: "birthdate", label: "Birthdate", kind: "text", placeholder: "YYYY-MM-DD" },
      { key: "heightCm", label: "Height (cm)", kind: "number" },
      { key: "bodyweight", label: "Bodyweight", kind: "number" },
    ],
  },
];

/**
 * The patch one field's new raw value becomes, or null when it isn't a valid
 * value for that field (an empty number box, say). Nullable fields send null
 * for an empty box. Decimals take a comma or a point (#675). A weight step
 * needs the current settings: it rewrites the whole overrides map, the way
 * the app's PRP settings do.
 */
export function fieldPatch(
  field: SettingsField,
  raw: string | boolean,
  settings?: SettingsPayload,
): Record<string, unknown> | null {
  switch (field.kind) {
    case "toggle":
      return typeof raw === "boolean" ? { [field.key]: raw } : null;
    case "select": {
      const option = field.options.find((candidate) => String(candidate.value) === String(raw));
      return option ? { [field.key]: option.value } : null;
    }
    case "number": {
      const text = String(raw).trim();
      if (text === "") return NULLABLE_NUMBERS.has(field.key) ? { [field.key]: null } : null;
      const value = Number(normalizeDecimalInput(text));
      if (!Number.isFinite(value)) return null;
      if (field.integer && !Number.isInteger(value)) return null;
      return { [field.key]: value };
    }
    case "text": {
      const text = String(raw).trim();
      return { [field.key]: text === "" ? null : text };
    }
    case "plates": {
      // "45, 25 10" or "1,25; 2,5": a comma followed by a space separates
      // plates, a bare comma is a decimal comma.
      const plates = String(raw)
        .split(/\s*;\s*|,\s+|\s+/)
        .filter(Boolean)
        .map((plate) => Number(normalizeDecimalInput(plate)));
      if (plates.length === 0 || plates.some((plate) => !Number.isFinite(plate) || plate <= 0)) {
        return null;
      }
      return { availablePlates: plates };
    }
    case "step": {
      if (!settings) return null;
      const text = normalizeDecimalInput(String(raw).trim());
      const value = Number(text);
      if (text !== "" && (!Number.isFinite(value) || value <= 0)) return null;
      const { units } = settings;
      const next: Record<string, Record<string, number>> = {};
      for (const [bucket, steps] of Object.entries(settings.dprEquipmentIncrements ?? {})) {
        next[bucket] = { ...steps };
      }
      const steps = { ...next[field.bucket] };
      if (text === "" || value === DEFAULT_INCREMENTS[field.bucket][units]) delete steps[units];
      else steps[units] = value;
      if (Object.keys(steps).length === 0) delete next[field.bucket];
      else next[field.bucket] = steps;
      return { dprEquipmentIncrements: next };
    }
  }
}

const NULLABLE_NUMBERS = new Set<keyof SettingsPayload>(["heightCm", "bodyweight"]);

/** A setting's current value as the text or choice its control shows. */
export function fieldDisplayValue(
  field: SettingsField,
  settings: SettingsPayload,
): string | boolean {
  const value = settings[field.key];
  if (field.kind === "toggle") return value === true;
  if (field.kind === "step") {
    const units = settings.units;
    return String(
      settings.dprEquipmentIncrements?.[field.bucket]?.[units] ??
        DEFAULT_INCREMENTS[field.bucket][units],
    );
  }
  if (field.kind === "plates") return settings.availablePlates.map((p) => Number(p)).join(", ");
  if (value === null || value === undefined) return field.kind === "select" ? "null" : "";
  if (field.kind === "number") return String(Number(value));
  return String(value);
}

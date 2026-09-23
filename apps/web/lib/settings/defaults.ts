import type { SettingsRow } from "@/lib/db/schema";

/** Mirrors packages/db's `users` table column defaults exactly. */
export const DEFAULT_SETTINGS: SettingsRow = {
  id: "me",
  units: "lb",
  defaultBarWeight: "45",
  availablePlates: ["45", "35", "25", "10", "5", "2.5"],
  defaultRestSeconds: 90,
  weekStart: 0,
  colorScheme: "system",
  accentColor: "zinc",
  fontFamily: "sans",
};

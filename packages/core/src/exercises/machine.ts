/**
 * Optional machine details on an exercise (issue #450): who made it, the
 * model, its pulley setup, and the gym it's at (issue #451). They tell two
 * "Lat Pulldown"s at different gyms apart, since loads on different machines
 * don't compare. A null pulley type means not a cable machine, or unknown.
 */
export const PULLEY_TYPES = ["single", "double"] as const;

export type PulleyType = (typeof PULLEY_TYPES)[number];

export const PULLEY_LABELS: Record<PulleyType, string> = {
  single: "Single pulley",
  double: "Double pulley",
};

export const MACHINE_TEXT_MAX = 80;

export interface MachineDetails {
  machineBrand?: string | null;
  machineModel?: string | null;
  pulleyType?: PulleyType | null;
}

/** Trims a make/model field to its stored form; blank becomes null. */
export function cleanMachineText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed.slice(0, MACHINE_TEXT_MAX);
}

/** "Hammer Strength Iso-Lateral Row", or null when neither is set. */
export function machineName(details: MachineDetails): string | null {
  const parts = [details.machineBrand, details.machineModel]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" ") : null;
}

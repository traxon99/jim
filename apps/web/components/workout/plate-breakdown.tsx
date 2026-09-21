import type { SettingsRow } from "@/lib/db/schema";
import { calculatePlateBreakdown } from "@jim/core";

/**
 * Only rendered for barbell lifts — a bodyweight row or a dumbbell curl has
 * no bar to break down, and there's no equipment taxonomy finer than the
 * free-text `equipment` field from the seed catalog (ADR-008) to detect it,
 * so this checks for "barbell" in that field rather than a dedicated flag.
 */
export function isBarbellExercise(equipment: string | null): boolean {
  return equipment?.toLowerCase().includes("barbell") ?? false;
}

export function PlateBreakdown({ weight, settings }: { weight: number; settings: SettingsRow }) {
  const barWeight = Number(settings.defaultBarWeight);
  const plates = settings.availablePlates.map(Number);
  const { perSide, remainderPerSide } = calculatePlateBreakdown(weight, barWeight, plates);

  if (perSide.length === 0 && remainderPerSide === 0) return null;

  return (
    <p className="text-xs text-zinc-500 dark:text-zinc-500">
      {perSide.length > 0 ? perSide.join(", ") : "bar only"} per side
      {remainderPerSide > 0 && ` (+${remainderPerSide} short)`}
    </p>
  );
}

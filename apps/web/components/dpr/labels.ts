import { DPR_PRESETS, type DprPresetName, type ExperienceLevel, GOAL_TABLE } from "@jim/core";

export const PRESET_LABELS: Record<DprPresetName, string> = {
  conservative: "Conservative",
  moderate: "Moderate",
  aggressive: "Aggressive",
};

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  novice: "Novice",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

/** e.g. "Add ~2.5% once you hit the top of your range at RPE ≤8 · goal +10% e1RM in 12 wks" */
export function presetSummary(name: DprPresetName, level: ExperienceLevel): string {
  const preset = DPR_PRESETS[name];
  const jump = preset.jumpPct === null ? "one small step" : `~${pct(preset.jumpPct)}`;
  const when =
    preset.qualifyingSessions > 1
      ? `after ${preset.qualifyingSessions} sessions in a row at the top of your range`
      : "once you hit the top of your range";
  const goal = pct(GOAL_TABLE[level][preset.goalPoint]);
  return `Add ${jump} ${when} at RPE ≤${preset.rpeCap} · goal +${goal} e1RM in 12 wks`;
}

export function formatWeight(value: number | null, units: string): string {
  if (value === null) return "—";
  return `${Math.round(value)} ${units}`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

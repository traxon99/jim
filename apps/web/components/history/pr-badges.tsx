import { STRENGTH_TIER_LABELS } from "@/lib/strength-standards/labels";
import {
  type PersonalRecordSortKey,
  type PrKind,
  type StrengthStandardTier,
  nextTier,
} from "@jim/core";
import { Medal, Sparkles } from "lucide-react";

/**
 * Labels, badges and hints shared by the PWA's PR list and the portal's
 * records page, so their copy and styling can't drift apart (#551).
 */

export const PR_KIND_LABELS: Record<PrKind, string> = {
  "1rm": "Estimated 1RM",
  weight: "Heaviest weight",
  volume: "Best single-set volume",
  reps_at_weight: "Most reps at a weight",
};

export const PR_SORT_OPTIONS: { value: PersonalRecordSortKey; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "heaviest", label: "Heaviest" },
  { value: "name", label: "Alphabetical" },
];

export function formatPrValue(value: number): string {
  return (Math.round(value * 100) / 100).toLocaleString();
}

export function NewBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      <Sparkles className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
      New
    </span>
  );
}

/** Bronze → silver → gold → platinum for 1–4+ plates a side (issue #237). */
const PLATE_MEDAL_CLASSES = [
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
] as const;

export function PlateMedal({ plates }: { plates: number }) {
  const tone = PLATE_MEDAL_CLASSES[Math.min(plates, PLATE_MEDAL_CLASSES.length) - 1];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      <Medal className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
      {plates} {plates === 1 ? "plate" : "plates"}
    </span>
  );
}

/** The next standard to reach, or that the top one is already reached. */
export function nextTierHint(standard: {
  tier: StrengthStandardTier | null;
  thresholds: Record<StrengthStandardTier, number>;
}): string {
  const upcoming = nextTier(standard.tier);
  if (!upcoming) return "Elite, the top published standard";
  return `${STRENGTH_TIER_LABELS[upcoming]} standard: ${standard.thresholds[upcoming]}`;
}

/** Every PR eligible for classification gets a badge, "Below Beginner" included, rather than none at all. */
export function tierBadgeLabel(tier: StrengthStandardTier | null): string {
  return tier ? STRENGTH_TIER_LABELS[tier] : "Below Beginner";
}

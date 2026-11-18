"use client";

import { Share } from "@/components/icons/solar";
import { ShareImageButton } from "@/components/share-card/share-image-button";
import { type CardExtras, prCardInput } from "@/lib/share-card/build";
import type { RecordSetDetails } from "@/lib/share-card/pr-source";
import type { PersonalRecordEntry, StrengthStandardTier } from "@jim/core";
import { useCallback } from "react";

/** Share image for one personal record (issue #838): an icon button on its row. */
export function PrShareButton({
  exerciseName,
  record,
  oneRepMax,
  standard,
  units,
  details,
  label,
}: {
  exerciseName: string;
  record: PersonalRecordEntry;
  oneRepMax: number | null;
  standard: { tier: StrengthStandardTier | null } | null;
  units: "lb" | "kg";
  details: RecordSetDetails;
  /** The kind's name, for the button's accessible name. */
  label: string;
}) {
  const tier = standard?.tier ?? null;
  const hasStandard = standard !== null;
  const { kind, value, achievedAt } = record;
  const { weight, reps } = details;
  const build = useCallback(
    (extras: CardExtras) => ({
      kind: "pr" as const,
      input: prCardInput(
        {
          exerciseName,
          kind,
          value,
          weight,
          reps,
          oneRepMax,
          achievedAt,
          standard: hasStandard ? { tier } : null,
          units,
        },
        extras,
      ),
    }),
    [exerciseName, kind, value, weight, reps, oneRepMax, achievedAt, hasStandard, tier, units],
  );
  return (
    <ShareImageButton
      build={build}
      title={`${exerciseName} PR`}
      text={`${exerciseName}: ${label} ${Math.round(value * 100) / 100}`}
      sessionId={details.sessionId}
      on={achievedAt}
      label={`Share ${exerciseName} ${label} as an image`}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-zinc-500 dark:text-zinc-400"
    >
      <Share className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
    </ShareImageButton>
  );
}

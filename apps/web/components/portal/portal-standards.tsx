"use client";

import { bodyweightOnDate } from "@/lib/bodyweight/series";
import { toTrendPoints } from "@/lib/portal/body-data";
import { reviveRecordEntries } from "@/lib/portal/records-data";
import {
  type PortalStandardsData,
  type StandardLiftRow,
  TARGET_REPS,
  buildStandardRows,
  ladderPosition,
} from "@/lib/portal/standards-data";
import { STANDARD_LIFT_LABELS, STRENGTH_TIER_LABELS } from "@/lib/strength-standards/labels";
import { strengthProfileOn } from "@/lib/strength-standards/profile";
import { STRENGTH_STANDARD_TIERS, ageAdjustmentFactor } from "@jim/core";
import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { PortalSectionHeader } from "./analysis-range";
import { useIsClient } from "./use-is-client";

function formatWeight(value: number): string {
  return Math.round(value).toLocaleString();
}

function TierBadge({ row }: { row: StandardLiftRow }) {
  if (row.oneRepMax == null) {
    return (
      <span className="shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
        Not logged
      </span>
    );
  }
  return (
    <span
      className={
        row.tier
          ? "shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground"
          : "shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
      }
    >
      {row.tier ? STRENGTH_TIER_LABELS[row.tier] : "Below Beginner"}
    </span>
  );
}

function NextStep({ row, units }: { row: StandardLiftRow; units: string }) {
  const { next } = row;
  if (!next) {
    return <p className="text-sm font-medium">Elite: the top published standard.</p>;
  }
  const label = STRENGTH_TIER_LABELS[next.tier];
  const set = `${formatWeight(next.workingWeight)} ${units} × ${TARGET_REPS}`;
  if (row.oneRepMax == null) {
    return (
      <p className="text-sm">
        <span className="font-medium">{label}</span> starts at {formatWeight(next.oneRepMax)}{" "}
        {units} e1RM, about {set}.
      </p>
    );
  }
  return (
    <p className="text-sm">
      <span className="font-medium">
        {label} at {formatWeight(next.oneRepMax)} {units}
      </span>
      : {formatWeight(next.toGo)} {units} to go, about {set}.
    </p>
  );
}

function StandardCard({
  row,
  units,
  showDates,
  predicted,
}: {
  row: StandardLiftRow;
  units: string;
  showDates: boolean;
  /** The lift's predicted 1RM today (issue #713). */
  predicted?: number;
}) {
  const position = ladderPosition(row.oneRepMax, row.thresholds);
  const name = row.name ?? STANDARD_LIFT_LABELS[row.lift];
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex min-w-0 items-start justify-between gap-3">
        {row.exerciseId ? (
          <Link
            href={`/portal/exercises/${row.exerciseId}`}
            className="min-w-0 break-words font-semibold underline-offset-4 hover:underline"
          >
            {name}
            <ChevronRight
              className="ml-0.5 inline h-4 w-4 align-[-3px] text-zinc-400"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </Link>
        ) : (
          <span className="min-w-0 break-words font-semibold">{name}</span>
        )}
        <TierBadge row={row} />
      </div>

      {row.oneRepMax != null && (
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-2xl font-semibold tabular-nums">
            {formatWeight(row.oneRepMax)} {units}
          </span>
          <span className="text-sm text-zinc-500 dark:text-zinc-500">
            e1RM
            {row.ratio != null && ` · ${row.ratio.toFixed(2)}× bodyweight`}
            {showDates &&
              row.achievedAt &&
              ` · ${row.achievedAt.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}`}
          </span>
          {predicted !== undefined && (
            <span className="text-sm text-zinc-500 dark:text-zinc-500">
              · predicted{" "}
              <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatWeight(predicted)} {units}
              </span>
            </span>
          )}
        </p>
      )}

      <div
        role="meter"
        aria-label={`${name} against the standards`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position * 100)}
        aria-valuetext={row.tier ? STRENGTH_TIER_LABELS[row.tier] : "Below Beginner"}
        className="grid h-2 grid-cols-5 gap-0.5 overflow-hidden rounded-full"
      >
        {STRENGTH_STANDARD_TIERS.map((tier, index) => {
          const fill = Math.min(1, Math.max(0, position * STRENGTH_STANDARD_TIERS.length - index));
          return (
            <span key={tier} className="relative bg-zinc-200 dark:bg-zinc-800">
              <span
                className="absolute inset-y-0 left-0 bg-accent"
                style={{ width: `${fill * 100}%` }}
              />
            </span>
          );
        })}
      </div>

      <ul className="flex flex-col text-sm">
        {STRENGTH_STANDARD_TIERS.map((tier) => {
          const cleared = row.oneRepMax != null && row.oneRepMax >= row.thresholds[tier];
          return (
            <li
              key={tier}
              className={`flex items-center justify-between gap-2 border-b border-zinc-200 py-1.5 dark:border-zinc-800 ${
                tier === row.tier ? "font-semibold" : ""
              }`}
            >
              <span className="flex items-center gap-1.5">
                {cleared ? (
                  <Check
                    className="h-3.5 w-3.5 text-green-700 dark:text-green-400"
                    strokeWidth={2.25}
                    aria-label="Reached"
                  />
                ) : (
                  <span className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {STRENGTH_TIER_LABELS[tier]}
              </span>
              <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                {formatWeight(row.thresholds[tier])}
              </span>
            </li>
          );
        })}
      </ul>

      <NextStep row={row} units={units} />
    </li>
  );
}

/**
 * The Analysis Standards section (issue #470): squat, bench, deadlift and
 * overhead press against the published strength standards at today's
 * bodyweight, with what the next tier takes as an e1RM and as a loadable
 * five-rep set. The same lookup the Records tiers and the phone's weight
 * suggestions use.
 */
export function PortalStandards({ data }: { data: PortalStandardsData }) {
  const isClient = useIsClient();
  const entries = useMemo(() => reviveRecordEntries(data.entries), [data.entries]);
  const profile = useMemo(() => {
    if (!data.strengthProfile) return null;
    const bodyweightAt = bodyweightOnDate(toTrendPoints(data.bodyweight));
    return strengthProfileOn(data.strengthProfile, bodyweightAt, new Date());
  }, [data.strengthProfile, data.bodyweight]);
  const rows = useMemo(
    () =>
      profile
        ? buildStandardRows({
            entries,
            exercises: data.exercises,
            profile,
            barWeight: data.barWeight,
            plates: data.plates,
          })
        : [],
    [entries, data.exercises, profile, data.barWeight, data.plates],
  );

  return (
    <div className="route-fade flex flex-col gap-6">
      <PortalSectionHeader title="Strength standards" />
      {!profile ? (
        <p className="rounded-lg border border-zinc-200 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          Add your sex and bodyweight in Jim, under Profile, then Settings, to see where your squat,
          bench, deadlift and overhead press rank.
        </p>
      ) : (
        <>
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            Judged at your bodyweight of {formatWeight(profile.bodyweight)} {data.units}
            {ageAdjustmentFactor(profile.age) < 1 && `, scaled for age ${profile.age}`}. Each tier
            is an estimated 1RM in {data.units}; the suggested set is one your bar and plates can
            load.
          </p>
          <ul className="grid gap-4 lg:grid-cols-2">
            {rows.map((row) => (
              <StandardCard
                key={row.lift}
                row={row}
                units={data.units}
                showDates={isClient}
                predicted={row.exerciseId ? data.predictions[row.exerciseId]?.value : undefined}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

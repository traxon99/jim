import type { PredictedOneRepMax } from "@jim/core";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

const CONFIDENCE_LABEL = { low: "low confidence", medium: "medium confidence", high: "" } as const;

/**
 * "+1.2/wk · low confidence": how the predicted 1RM (issue #713) is moving,
 * and how much history backs it. A flat trend reads "steady".
 */
export function predictionDetail(prediction: PredictedOneRepMax, units?: string): string {
  const rounded = Math.round(prediction.trendPerWeek * 10) / 10;
  const trend =
    rounded === 0
      ? "steady"
      : `${rounded > 0 ? "+" : ""}${rounded.toLocaleString()}${units ? ` ${units}` : ""}/wk`;
  return [trend, CONFIDENCE_LABEL[prediction.confidence]].filter(Boolean).join(" · ");
}

/** The predicted 1RM as a headline number with its trend, for charts and stat rows. */
export function PredictedOneRepMaxStat({
  prediction,
  units,
}: {
  prediction: PredictedOneRepMax;
  units?: string;
}) {
  const rounded = Math.round(prediction.trendPerWeek * 10) / 10;
  const Icon = rounded > 0 ? ArrowUpRight : rounded < 0 ? ArrowDownRight : ArrowRight;
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className="text-2xl font-semibold tabular-nums text-accent">
        {Math.round(prediction.value).toLocaleString()}
      </span>
      <span className="flex min-w-0 items-center gap-0.5 text-xs text-zinc-500 dark:text-zinc-500">
        Predicted 1RM
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
        <span className="truncate">{predictionDetail(prediction, units)}</span>
      </span>
    </div>
  );
}

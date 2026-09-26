import type { OnTrackStatus } from "@jim/core";
import { CircleAlert, CircleCheck, TrendingUp } from "lucide-react";

const PILLS: Record<OnTrackStatus, { label: string; className: string; Icon: typeof CircleCheck }> =
  {
    ahead: {
      label: "Ahead",
      className: "border-green-600 text-green-700 dark:border-green-500 dark:text-green-400",
      Icon: TrendingUp,
    },
    on_track: {
      label: "On track",
      className: "border-zinc-400 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300",
      Icon: CircleCheck,
    },
    behind: {
      label: "Behind",
      className: "border-orange-600 text-orange-700 dark:border-orange-500 dark:text-orange-400",
      Icon: CircleAlert,
    },
  };

/** Ahead / on track / behind — icon and label, never color alone. */
export function StatusPill({ status }: { status: OnTrackStatus }) {
  const { label, className, Icon } = PILLS[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      <Icon className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
      {label}
    </span>
  );
}

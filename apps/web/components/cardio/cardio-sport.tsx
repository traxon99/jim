import {
  Bicycling,
  HeartPulse,
  type IconComponent,
  Running,
  Stopwatch,
  Swimming,
  Treadmill,
  TrendingUp,
  Walking,
  Waves,
  Zap,
} from "@/components/icons/solar";
import type { CardioKind } from "@jim/core";

/**
 * Each cardio kind's glyph and hue (issue #872). The hues are categorical,
 * like routine colors: they tell a run from a swim at a glance on the
 * workout card, a record and a badge, and stay out of controls, which keep
 * the accent (#445).
 */
export const CARDIO_SPORT_ICON: Record<CardioKind, IconComponent> = {
  run: Running,
  walk: Walking,
  ride: Bicycling,
  row: Waves,
  ski: Waves,
  swim: Swimming,
  elliptical: Treadmill,
  stairs: TrendingUp,
  boxing: Zap,
  rope: Stopwatch,
  other: HeartPulse,
};

interface SportTone {
  /** A soft tile behind the glyph. */
  tile: string;
  /** A filled badge. */
  solid: string;
}

export const CARDIO_SPORT_TONE: Record<CardioKind, SportTone> = {
  run: {
    tile: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    solid: "from-orange-300 via-orange-500 to-orange-600",
  },
  walk: {
    tile: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
    solid: "from-yellow-300 via-yellow-500 to-amber-600",
  },
  ride: {
    tile: "bg-green-500/15 text-green-700 dark:text-green-400",
    solid: "from-green-300 via-green-500 to-green-700",
  },
  row: {
    tile: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
    solid: "from-cyan-300 via-cyan-500 to-cyan-700",
  },
  ski: {
    tile: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    solid: "from-sky-300 via-sky-500 to-sky-700",
  },
  swim: {
    tile: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    solid: "from-blue-300 via-blue-500 to-blue-700",
  },
  elliptical: {
    tile: "bg-teal-500/15 text-teal-700 dark:text-teal-400",
    solid: "from-teal-300 via-teal-500 to-teal-700",
  },
  stairs: {
    tile: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
    solid: "from-purple-300 via-purple-500 to-purple-700",
  },
  boxing: {
    tile: "bg-red-500/15 text-red-600 dark:text-red-400",
    solid: "from-red-300 via-red-500 to-red-700",
  },
  rope: {
    tile: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
    solid: "from-pink-300 via-pink-500 to-pink-700",
  },
  other: {
    tile: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    solid: "from-rose-300 via-rose-500 to-rose-700",
  },
};

/** The kind's glyph on its soft tile, beside an exercise name. */
export function CardioSportTile({
  kind,
  size = "sm",
}: {
  kind: CardioKind;
  size?: "sm" | "md";
}) {
  const Icon = CARDIO_SPORT_ICON[kind];
  const box = size === "md" ? "h-11 w-11 rounded-[13px]" : "h-8 w-8 rounded-[9px]";
  const icon = size === "md" ? "h-6 w-6" : "h-[18px] w-[18px]";
  return (
    <span
      className={`flex shrink-0 items-center justify-center ${box} ${CARDIO_SPORT_TONE[kind].tile}`}
    >
      <Icon className={icon} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

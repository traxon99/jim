import { CARDIO_SPORT_ICON, CARDIO_SPORT_TONE } from "@/components/cardio/cardio-sport";
import {
  Disc3,
  Dumbbell,
  HeartPulse,
  type IconComponent,
  PersonStanding,
  Trophy,
  Weight,
} from "@/components/icons/solar";
import type { Achievement, AchievementCategory } from "@jim/core";
import type { CSSProperties } from "react";

const ACHIEVEMENT_ICONS: Record<AchievementCategory, IconComponent> = {
  workouts: Dumbbell,
  volume: Weight,
  plates: Disc3,
  bodyweight: PersonStanding,
  strength: Trophy,
  cardio: HeartPulse,
};

/**
 * One achievement as a round badge (issue #253). Earned badges take the
 * accent color; locked ones stay muted so the earned ones read at a glance
 * in both color schemes. A cardio badge (issue #872) wears its sport's glyph
 * on that sport's hue, as a lit disc with an inner ring.
 */
export function AchievementBadge({
  achievement,
  size = "md",
  className = "",
  style,
}: {
  achievement: Pick<Achievement, "category" | "achievedAt" | "sport">;
  size?: "md" | "lg";
  className?: string;
  style?: CSSProperties;
}) {
  const sport = achievement.category === "cardio" ? (achievement.sport ?? "other") : null;
  const Icon = sport ? CARDIO_SPORT_ICON[sport] : ACHIEVEMENT_ICONS[achievement.category];
  const earned = achievement.achievedAt != null;
  const dimensions = size === "lg" ? "h-14 w-14" : "h-10 w-10";
  const iconSize = size === "lg" ? "h-7 w-7" : "h-5 w-5";
  const fill = !earned
    ? "border border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-600"
    : sport
      ? `cardio-badge bg-linear-160 text-white ${CARDIO_SPORT_TONE[sport].solid}`
      : "bg-accent text-accent-foreground shadow-sm";
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center rounded-full ${dimensions} ${fill} ${className}`}
      style={style}
    >
      <Icon className={iconSize} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

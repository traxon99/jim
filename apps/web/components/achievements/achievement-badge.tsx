import type { Achievement, AchievementCategory } from "@jim/core";
import { Disc3, Dumbbell, type LucideIcon, PersonStanding, Trophy, Weight } from "lucide-react";
import type { CSSProperties } from "react";

const ACHIEVEMENT_ICONS: Record<AchievementCategory, LucideIcon> = {
  workouts: Dumbbell,
  volume: Weight,
  plates: Disc3,
  bodyweight: PersonStanding,
  strength: Trophy,
};

/**
 * One achievement as a round badge (issue #253). Earned badges take the
 * accent color; locked ones stay muted so the earned ones read at a glance
 * in both color schemes.
 */
export function AchievementBadge({
  achievement,
  size = "md",
  className = "",
  style,
}: {
  achievement: Pick<Achievement, "category" | "achievedAt">;
  size?: "md" | "lg";
  className?: string;
  style?: CSSProperties;
}) {
  const Icon = ACHIEVEMENT_ICONS[achievement.category];
  const earned = achievement.achievedAt != null;
  const dimensions = size === "lg" ? "h-14 w-14" : "h-10 w-10";
  const iconSize = size === "lg" ? "h-7 w-7" : "h-5 w-5";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ${dimensions} ${
        earned
          ? "bg-accent text-accent-foreground shadow-sm"
          : "border border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-600"
      } ${className}`}
      style={style}
    >
      <Icon className={iconSize} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

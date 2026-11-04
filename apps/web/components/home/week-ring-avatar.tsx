import { Avatar } from "@/components/friends/avatar";
import type { WeekRingDisplay } from "@jim/core";

const SIZE = 64;
const STROKE = 3;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/**
 * Avatar with a weekly progress ring (issue #750). Accent fill and a check when
 * the goal is met; no ring when a friend turned sharing off.
 */
export function WeekRingAvatar({
  person,
  showGoalBadge = true,
}: {
  person: WeekRingDisplay;
  /** When false, the ✓ badge is rendered outside the ripple wrapper (#522). */
  showGoalBadge?: boolean;
}) {
  const { progress, goalMet, shareWorkouts } = person;
  const showRing = shareWorkouts && progress !== null;
  const dash = showRing ? C * (goalMet ? 1 : progress) : 0;

  return (
    <div className="relative h-16 w-16 shrink-0">
      {showRing && (
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className={`absolute inset-0 h-full w-full ${goalMet ? "text-accent" : "text-zinc-300 dark:text-zinc-700"}`}
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            className="opacity-40"
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${C}`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            className={goalMet ? "text-accent" : "text-zinc-950 dark:text-zinc-50"}
          />
        </svg>
      )}
      <div className="absolute inset-[5px]">
        <Avatar
          username={person.username}
          avatar={person.avatar}
          className="h-[54px] w-[54px] text-xl"
        />
      </div>
      {showGoalBadge && showRing && goalMet && (
        <GoalMetBadge className="absolute -bottom-0.5 -right-0.5" />
      )}
    </div>
  );
}

/** Shown beside the ripple target so overflow clipping doesn't hide it (#522). */
export function GoalMetBadge({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground ring-2 ring-white dark:ring-zinc-950 ${className}`}
    >
      ✓
    </span>
  );
}

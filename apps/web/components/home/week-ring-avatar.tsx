import { Avatar } from "@/components/friends/avatar";
import type { WeekRingDisplay } from "@jim/core";
import { Check } from "lucide-react";

const SIZE = 64;
const STROKE = 3;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/**
 * Avatar with a weekly progress ring (issue #750). Green and a check when the
 * goal is met; no ring when a friend turned sharing off.
 */
export function WeekRingAvatar({ person }: { person: WeekRingDisplay }) {
  const { progress, goalMet, shareWorkouts } = person;
  const showRing = shareWorkouts && progress !== null;
  const ringColor = goalMet ? "#22c55e" : "currentColor";
  const dash = showRing ? C * (goalMet ? 1 : progress) : 0;

  return (
    <div className="relative h-16 w-16 shrink-0">
      {showRing && (
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className={`absolute inset-0 h-full w-full ${goalMet ? "text-emerald-500" : "text-zinc-300 dark:text-zinc-700"}`}
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
            stroke={ringColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${C}`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            className={goalMet ? "text-emerald-500" : "text-zinc-950 dark:text-zinc-50"}
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
      {showRing && goalMet && (
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white dark:ring-zinc-950"
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
    </div>
  );
}

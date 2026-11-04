/** Workouts · Friends · Streak counts under the profile header. */
export function ProfileStatRow({
  workouts,
  friends,
  streakWeeks,
}: {
  workouts: number;
  friends: number;
  streakWeeks: number;
}) {
  return (
    <dl className="flex flex-1 justify-around text-center">
      <Stat value={workouts} label="Workouts" />
      <Stat value={friends} label="Friends" />
      <Stat value={streakWeeks} label="Streak" suffix=" wk" />
    </dl>
  );
}

function Stat({ value, label, suffix = "" }: { value: number; label: string; suffix?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-zinc-500 dark:text-zinc-500">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums tracking-tight">
        {value}
        {suffix && value > 0 ? (
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-500">{suffix}</span>
        ) : null}
      </dd>
    </div>
  );
}

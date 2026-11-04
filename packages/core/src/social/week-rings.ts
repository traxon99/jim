/** One person in Home's week-rings strip (issue #750). */
export interface WeekRingPerson {
  userId: string;
  username: string;
  avatar: string | null;
  /** False when a friend turned off workout sharing — show a plain avatar. */
  shareWorkouts: boolean;
  workoutsThisWeek: number;
  weeklyGoal: number;
  /** Most recent finished workout, for sorting friends. */
  lastWorkoutAt: string | null;
  isSelf?: boolean;
}

export interface WeekRingDisplay extends WeekRingPerson {
  goalMet: boolean;
  /** 0..1 when `shareWorkouts`; null when the ring is hidden. */
  progress: number | null;
}

const GOAL_MIN = 1;
const GOAL_MAX = 7;

/** Allowed weekly workout goals for Settings and MCP. */
export function isValidWeeklyWorkoutGoal(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= GOAL_MIN && value <= GOAL_MAX
  );
}

export function clampWeeklyWorkoutGoal(goal: number): number {
  return Math.min(GOAL_MAX, Math.max(GOAL_MIN, goal));
}

export function weekRingProgress(done: number, goal: number): number {
  const target = clampWeeklyWorkoutGoal(goal);
  return Math.min(1, Math.max(0, done / target));
}

export function weekRingGoalMet(done: number, goal: number): boolean {
  return done >= clampWeeklyWorkoutGoal(goal);
}

function lastWorkoutMs(person: WeekRingPerson): number {
  return person.lastWorkoutAt ? Date.parse(person.lastWorkoutAt) : 0;
}

/** You first, then incomplete goals (most recent workout first), then completed. */
export function sortWeekRingPeople(people: readonly WeekRingPerson[]): WeekRingPerson[] {
  const self = people.find((p) => p.isSelf);
  const friends = people.filter((p) => !p.isSelf);
  const incomplete = friends
    .filter((p) => !weekRingGoalMet(p.workoutsThisWeek, p.weeklyGoal))
    .sort((a, b) => lastWorkoutMs(b) - lastWorkoutMs(a));
  const complete = friends
    .filter((p) => weekRingGoalMet(p.workoutsThisWeek, p.weeklyGoal))
    .sort((a, b) => lastWorkoutMs(b) - lastWorkoutMs(a));
  return [...(self ? [self] : []), ...incomplete, ...complete];
}

export function toWeekRingDisplay(person: WeekRingPerson): WeekRingDisplay {
  const goalMet = weekRingGoalMet(person.workoutsThisWeek, person.weeklyGoal);
  return {
    ...person,
    weeklyGoal: clampWeeklyWorkoutGoal(person.weeklyGoal),
    goalMet,
    progress: person.shareWorkouts
      ? weekRingProgress(person.workoutsThisWeek, person.weeklyGoal)
      : null,
  };
}

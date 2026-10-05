import { describe, expect, it } from "vitest";
import { type ProgramProgressSession, summarizeProgramProgress } from "../progress";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

function session(
  id: string,
  routineId: string | null,
  n: number,
  extra: Partial<ProgramProgressSession> = {},
): ProgramProgressSession {
  return { id, routineId, startedAt: day(n), endedAt: day(n), deletedAt: null, ...extra };
}

const set = (
  sessionId: string,
  exerciseId: string,
  weight: number | null,
  reps: number | null,
) => ({
  sessionId,
  exerciseId,
  weight,
  reps,
});

describe("summarizeProgramProgress", () => {
  it("counts finished workouts of the program's routines since activation", () => {
    const progress = summarizeProgramProgress({
      routineIds: ["push", "pull"],
      since: day(1),
      sessions: [
        session("before", "push", 0),
        session("a", "push", 2),
        session("b", "pull", 4),
        session("other", "legs", 5),
        session("adhoc", null, 5),
        session("open", "push", 6, { endedAt: null }),
        session("deleted", "pull", 7, { deletedAt: day(8) }),
      ],
      sets: [
        set("before", "bench", 100, 5),
        set("a", "bench", 100, 5),
        set("a", "plank", null, null),
        set("b", "row", 80, 10),
        set("other", "squat", 140, 5),
      ],
    });
    expect(progress.workoutCount).toBe(2);
    expect(progress.firstAt).toEqual(day(2));
    expect(progress.lastAt).toEqual(day(4));
    expect(progress.setCount).toBe(3);
    expect(progress.totalVolume).toBe(100 * 5 + 80 * 10);
  });

  it("compares each exercise's best e1RM in its first and latest workout", () => {
    const progress = summarizeProgramProgress({
      routineIds: ["push"],
      since: null,
      sessions: [session("s3", "push", 9), session("s1", "push", 1), session("s2", "push", 5)],
      sets: [
        set("s1", "bench", 90, 1),
        set("s1", "bench", 100, 1),
        set("s2", "bench", 105, 1),
        set("s3", "bench", 110, 1),
        set("s3", "bench", 60, 1),
        set("s2", "dip", 20, 1),
      ],
    });
    expect(progress.exercises).toEqual([
      { exerciseId: "bench", sessionCount: 3, firstE1rm: 100, latestE1rm: 110, change: 10 },
      { exerciseId: "dip", sessionCount: 1, firstE1rm: 20, latestE1rm: 20, change: 0 },
    ]);
  });

  it("is empty when no workouts were done", () => {
    expect(
      summarizeProgramProgress({ routineIds: ["push"], since: null, sessions: [], sets: [] }),
    ).toEqual({
      workoutCount: 0,
      firstAt: null,
      lastAt: null,
      setCount: 0,
      totalVolume: 0,
      exercises: [],
    });
  });
});

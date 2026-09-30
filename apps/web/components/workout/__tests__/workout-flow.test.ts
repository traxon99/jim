import { cancelSession, finalizeSession } from "@/lib/sessions/finalize-session";
import { loadPreviousSetsByIndex } from "@/lib/sessions/previous-set-lookup";
import { completeSet, deleteSet, editSet, restoreSet } from "@/lib/sessions/set-actions";
import { startEmptySession, startSessionFromRoutine } from "@/lib/sessions/start-session";
import { calculatePlateBreakdown, resolveCurrentRows, summarizeSession, uuidv7 } from "@jim/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type JimDatabase,
  type RoutineExerciseRow,
  type SessionExerciseRow,
  createTestDb,
} from "../../../lib/db/schema";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const BENCH_ID = "22222222-2222-2222-2222-222222222222";
const SQUAT_ID = "33333333-3333-3333-3333-333333333333";
const ROUTINE_ID = "44444444-4444-4444-4444-444444444444";

let testDb: JimDatabase;

beforeEach(() => {
  testDb = createTestDb(`jim-workout-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

function routineExercise(overrides: Partial<RoutineExerciseRow> = {}): RoutineExerciseRow {
  return {
    id: uuidv7(),
    userId: USER_ID,
    routineId: ROUTINE_ID,
    exerciseId: BENCH_ID,
    position: 0,
    supersetGroup: null,
    targetSets: 5,
    targetRepsLow: 5,
    targetRepsHigh: 5,
    targetRestSeconds: 120,
    targetDurationSeconds: null,
    targetWeight: null,
    notes: null,
    updatedAt: new Date(),
    deviceId: "device-a",
    deletedAt: null,
    serverSeq: 0,
    ...overrides,
  };
}

describe("starting a session (against Dexie)", () => {
  it("an empty session built fully offline is immediately visible, queued to the outbox", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);

    const session = await testDb.sessions.get(sessionId);
    expect(session).toBeDefined();
    expect(session?.endedAt).toBeNull();

    const outbox = await testDb.outbox.toArray();
    expect(outbox.some((entry) => entry.table === "sessions")).toBe(true);
  });

  it("starting from a routine clones its exercises onto the new session", async () => {
    const items = [
      routineExercise({ id: "ri1", exerciseId: BENCH_ID, position: 0 }),
      routineExercise({ id: "ri2", exerciseId: SQUAT_ID, position: 1 }),
    ];

    const sessionId = await startSessionFromRoutine(
      USER_ID,
      { id: ROUTINE_ID, name: "Push day" },
      items,
      testDb,
    );

    const session = await testDb.sessions.get(sessionId);
    expect(session?.routineId).toBe(ROUTINE_ID);
    expect(session?.name).toBe("Push day");

    const sessionExercises = await testDb.sessionExercises
      .where("sessionId")
      .equals(sessionId)
      .toArray();
    expect(sessionExercises.map((se) => se.exerciseId).sort()).toEqual([BENCH_ID, SQUAT_ID].sort());
  });
});

describe("logging sets and detecting PRs (against Dexie)", () => {
  async function makeSessionExercise(sessionId: string, exerciseId: string) {
    const sessionExercise: SessionExerciseRow = {
      id: uuidv7(),
      userId: USER_ID,
      sessionId,
      exerciseId,
      position: 0,
      supersetGroup: null,
      notes: null,
      stickyNote: null,
      restSeconds: null,
      warmupSets: null,
      updatedAt: new Date(),
      deviceId: "device-a",
      deletedAt: null,
      serverSeq: 0,
    };
    await testDb.sessionExercises.put(sessionExercise);
    return sessionExercise;
  }

  it("the first set ever logged for a loaded exercise is a PR across every kind it tracks", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);
    const sessionExercise = await makeSessionExercise(sessionId, BENCH_ID);

    const { set, prs } = await completeSet(
      {
        userId: USER_ID,
        sessionExerciseId: sessionExercise.id,
        exerciseId: BENCH_ID,
        setIndex: 0,
        kind: "working",
        weight: 135,
        reps: 5,
      },
      testDb,
    );

    expect(set.weight).toBe("135");
    // No "most reps at a weight" for a loaded lift (issue #354).
    expect(prs.map((pr) => pr.kind).sort()).toEqual(["1rm", "volume", "weight"].sort());

    const records = await testDb.personalRecords.where("exerciseId").equals(BENCH_ID).toArray();
    expect(records).toHaveLength(3);
    expect(records.every((r) => r.setId === set.id)).toBe(true);
  });

  it("a bodyweight exercise still earns most-reps-at-a-weight PRs", async () => {
    const DIP_ID = "44444444-4444-4444-4444-444444444444";
    await testDb.exercises.put({
      id: DIP_ID,
      ownerId: null,
      slug: "weighted-dip",
      name: "Weighted Dip",
      aliases: [],
      primaryMuscles: ["chest"],
      secondaryMuscles: ["triceps"],
      equipment: "body only",
      mechanic: "compound",
      force: "push",
      level: "intermediate",
      trackingType: "weighted_bodyweight",
      category: "strength",
      instructions: [],
      imageUrls: [],
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deviceId: "device-a",
      serverSeq: 0,
    });
    const sessionId = await startEmptySession(USER_ID, testDb);
    const sessionExercise = await makeSessionExercise(sessionId, DIP_ID);

    const { prs } = await completeSet(
      {
        userId: USER_ID,
        sessionExerciseId: sessionExercise.id,
        exerciseId: DIP_ID,
        setIndex: 0,
        kind: "working",
        weight: 25,
        reps: 10,
      },
      testDb,
    );

    expect(prs.map((pr) => pr.kind)).toContain("reps_at_weight");
  });

  it("a weaker set right after doesn't re-trigger any PR", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);
    const sessionExercise = await makeSessionExercise(sessionId, BENCH_ID);

    await completeSet(
      {
        userId: USER_ID,
        sessionExerciseId: sessionExercise.id,
        exerciseId: BENCH_ID,
        setIndex: 0,
        kind: "working",
        weight: 135,
        reps: 5,
      },
      testDb,
    );

    const { prs } = await completeSet(
      {
        userId: USER_ID,
        sessionExerciseId: sessionExercise.id,
        exerciseId: BENCH_ID,
        setIndex: 1,
        kind: "working",
        weight: 135,
        reps: 3,
      },
      testDb,
    );

    expect(prs).toEqual([]);
  });

  it("warm-up sets never set a PR, and a lighter working set after a heavier one isn't a PR", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);
    const sessionExercise = await makeSessionExercise(sessionId, BENCH_ID);
    const log = (setIndex: number, kind: "warmup" | "working", weight: number, reps: number) =>
      completeSet(
        {
          userId: USER_ID,
          sessionExerciseId: sessionExercise.id,
          exerciseId: BENCH_ID,
          setIndex,
          kind,
          weight,
          reps,
        },
        testDb,
      );

    // Issue #352: warm-ups at 45×5 and 55×2, then 160×8 and 150×8.
    expect((await log(0, "warmup", 45, 5)).prs).toEqual([]);
    expect((await log(1, "warmup", 55, 2)).prs).toEqual([]);
    expect((await log(2, "working", 160, 8)).prs).not.toEqual([]);
    expect((await log(3, "working", 150, 8)).prs).toEqual([]);
  });

  it("shows last session's sets as 'the number to beat' for the next session", async () => {
    const firstSessionId = await startEmptySession(USER_ID, testDb);
    const firstSessionExercise = await makeSessionExercise(firstSessionId, BENCH_ID);
    await completeSet(
      {
        userId: USER_ID,
        sessionExerciseId: firstSessionExercise.id,
        exerciseId: BENCH_ID,
        setIndex: 0,
        kind: "working",
        weight: 135,
        reps: 5,
      },
      testDb,
    );
    const firstSession = await testDb.sessions.get(firstSessionId);
    if (!firstSession) throw new Error("session missing");
    await finalizeSession(
      firstSession,
      testDb,
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response(JSON.stringify({ results: [], cursor: 0, changes: {} }))),
        ),
    );

    const secondSessionId = await startEmptySession(USER_ID, testDb);
    const secondSessionExercise = await makeSessionExercise(secondSessionId, BENCH_ID);

    const previousByIndex = await loadPreviousSetsByIndex(BENCH_ID, secondSessionId, testDb);
    expect(previousByIndex.get(0)).toMatchObject({ weight: 135, reps: 5 });

    // sanity: the second session_exercise is real and distinct from the first
    expect(secondSessionExercise.sessionId).toBe(secondSessionId);
  });

  it("editing a completed set supersedes it rather than updating in place (ADR-003)", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);
    const sessionExercise = await makeSessionExercise(sessionId, BENCH_ID);
    const { set: original } = await completeSet(
      {
        userId: USER_ID,
        sessionExerciseId: sessionExercise.id,
        exerciseId: BENCH_ID,
        setIndex: 0,
        kind: "working",
        weight: 135,
        reps: 5,
      },
      testDb,
    );

    const edited = await editSet({ original, weight: 145, reps: 5, kind: "working" }, testDb);

    expect(edited.supersedesId).toBe(original.id);

    const allRows = await testDb.sets
      .where("sessionExerciseId")
      .equals(sessionExercise.id)
      .toArray();
    expect(allRows).toHaveLength(2); // the original row is never removed...
    const current = resolveCurrentRows(allRows);
    expect(current).toHaveLength(1); // ...but only the newer one is "current"
    expect(current[0]?.weight).toBe("145");
  });

  it("stores RPE on a logged set and lets an edit change it", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);
    const sessionExercise = await makeSessionExercise(sessionId, BENCH_ID);
    const { set } = await completeSet(
      {
        userId: USER_ID,
        sessionExerciseId: sessionExercise.id,
        exerciseId: BENCH_ID,
        setIndex: 0,
        kind: "working",
        weight: 135,
        reps: 5,
        rpe: 8,
      },
      testDb,
    );

    expect(set.rpe).toBe("8");

    const edited = await editSet(
      { original: set, weight: 135, reps: 5, kind: "working", rpe: 8.5 },
      testDb,
    );
    expect(edited.rpe).toBe("8.5");
  });

  it("leaves RPE null when not given, same as weight and reps", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);
    const sessionExercise = await makeSessionExercise(sessionId, BENCH_ID);
    const { set } = await completeSet(
      {
        userId: USER_ID,
        sessionExerciseId: sessionExercise.id,
        exerciseId: BENCH_ID,
        setIndex: 0,
        kind: "working",
        weight: 135,
        reps: 5,
      },
      testDb,
    );

    expect(set.rpe).toBeNull();
  });

  it("deleting a set writes a tombstone via a superseding row rather than removing it", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);
    const sessionExercise = await makeSessionExercise(sessionId, BENCH_ID);
    const { set } = await completeSet(
      {
        userId: USER_ID,
        sessionExerciseId: sessionExercise.id,
        exerciseId: BENCH_ID,
        setIndex: 0,
        kind: "working",
        weight: 135,
        reps: 5,
      },
      testDb,
    );

    await deleteSet(set, testDb);

    const allRows = await testDb.sets
      .where("sessionExerciseId")
      .equals(sessionExercise.id)
      .toArray();
    expect(allRows).toHaveLength(2);
    const stillThere = await testDb.sets.get(set.id);
    expect(stillThere).toBeDefined();

    const current = resolveCurrentRows(allRows).filter((row) => !row.deletedAt);
    expect(current).toHaveLength(0);
  });

  it("undoing a delete brings the set back with its logged values (issue #318)", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);
    const sessionExercise = await makeSessionExercise(sessionId, BENCH_ID);
    const { set } = await completeSet(
      {
        userId: USER_ID,
        sessionExerciseId: sessionExercise.id,
        exerciseId: BENCH_ID,
        setIndex: 0,
        kind: "working",
        weight: 135,
        reps: 5,
      },
      testDb,
    );

    const tombstone = await deleteSet(set, testDb);
    await restoreSet(tombstone, testDb);

    const allRows = await testDb.sets
      .where("sessionExerciseId")
      .equals(sessionExercise.id)
      .toArray();
    expect(allRows).toHaveLength(3);
    const current = resolveCurrentRows(allRows).filter((row) => !row.deletedAt);
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ weight: "135", reps: 5, setIndex: 0, deletedAt: null });
  });
});

describe("finalizing a session (against Dexie)", () => {
  function makeFetchMock() {
    return vi.fn().mockImplementation((url: string) => {
      if (url.includes("/push")) {
        return Promise.resolve(
          new Response(JSON.stringify({ results: [{ id: "x", status: "applied" }] })),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ cursor: 0, changes: {} })));
    });
  }

  it("stamps endedAt and pushes immediately once a set has been logged", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);
    const sessionExercise: SessionExerciseRow = {
      id: uuidv7(),
      userId: USER_ID,
      sessionId,
      exerciseId: BENCH_ID,
      position: 0,
      supersetGroup: null,
      notes: null,
      stickyNote: null,
      restSeconds: null,
      warmupSets: null,
      updatedAt: new Date(),
      deviceId: "device-a",
      deletedAt: null,
      serverSeq: 0,
    };
    await testDb.sessionExercises.put(sessionExercise);
    await completeSet(
      {
        userId: USER_ID,
        sessionExerciseId: sessionExercise.id,
        exerciseId: BENCH_ID,
        setIndex: 0,
        kind: "working",
        weight: 135,
        reps: 5,
      },
      testDb,
    );
    const session = await testDb.sessions.get(sessionId);
    if (!session) throw new Error("session missing");

    const fetchMock = makeFetchMock();
    const { cancelled } = await finalizeSession(
      session,
      testDb,
      fetchMock as unknown as typeof fetch,
    );

    expect(cancelled).toBe(false);
    const ended = await testDb.sessions.get(sessionId);
    expect(ended?.endedAt).not.toBeNull();
    expect(ended?.deletedAt).toBeNull();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("cancels (soft-deletes) a session with no exercises added, rather than tracking it", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);
    const session = await testDb.sessions.get(sessionId);
    if (!session) throw new Error("session missing");

    const fetchMock = makeFetchMock();
    const { cancelled } = await finalizeSession(
      session,
      testDb,
      fetchMock as unknown as typeof fetch,
    );

    expect(cancelled).toBe(true);
    const ended = await testDb.sessions.get(sessionId);
    expect(ended?.endedAt).toBeNull();
    expect(ended?.deletedAt).not.toBeNull();
  });

  it("cancels a session that has exercises added but no sets logged", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);
    await testDb.sessionExercises.put({
      id: uuidv7(),
      userId: USER_ID,
      sessionId,
      exerciseId: BENCH_ID,
      position: 0,
      supersetGroup: null,
      notes: null,
      stickyNote: null,
      restSeconds: null,
      warmupSets: null,
      updatedAt: new Date(),
      deviceId: "device-a",
      deletedAt: null,
      serverSeq: 0,
    });
    const session = await testDb.sessions.get(sessionId);
    if (!session) throw new Error("session missing");

    const { cancelled } = await finalizeSession(
      session,
      testDb,
      makeFetchMock() as unknown as typeof fetch,
    );

    expect(cancelled).toBe(true);
    const ended = await testDb.sessions.get(sessionId);
    expect(ended?.deletedAt).not.toBeNull();
  });

  it("summarizes volume and duration entirely from local sets, with no network", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);
    const sessionExercise: SessionExerciseRow = {
      id: uuidv7(),
      userId: USER_ID,
      sessionId,
      exerciseId: BENCH_ID,
      position: 0,
      supersetGroup: null,
      notes: null,
      stickyNote: null,
      restSeconds: null,
      warmupSets: null,
      updatedAt: new Date(),
      deviceId: "device-a",
      deletedAt: null,
      serverSeq: 0,
    };
    await testDb.sessionExercises.put(sessionExercise);
    await completeSet(
      {
        userId: USER_ID,
        sessionExerciseId: sessionExercise.id,
        exerciseId: BENCH_ID,
        setIndex: 0,
        kind: "working",
        weight: 135,
        reps: 5,
      },
      testDb,
    );

    const rawSets = await testDb.sets
      .where("sessionExerciseId")
      .equals(sessionExercise.id)
      .toArray();
    const sets = resolveCurrentRows(rawSets).filter((s) => !s.deletedAt);
    const session = await testDb.sessions.get(sessionId);
    if (!session) throw new Error("session missing");

    const summary = summarizeSession(
      sets.map((s) => ({ weight: s.weight == null ? null : Number(s.weight), reps: s.reps })),
      session.startedAt,
      new Date(session.startedAt.getTime() + 60_000),
    );

    expect(summary.totalVolume).toBe(135 * 5);
    expect(summary.setCount).toBe(1);
  });
});

describe("cancelling a session (against Dexie)", () => {
  function makeFetchMock() {
    return vi.fn().mockImplementation((url: string) => {
      if (url.includes("/push")) {
        return Promise.resolve(
          new Response(JSON.stringify({ results: [{ id: "x", status: "applied" }] })),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ cursor: 0, changes: {} })));
    });
  }

  it("soft-deletes a session with no exercises added", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);
    const session = await testDb.sessions.get(sessionId);
    if (!session) throw new Error("session missing");

    await cancelSession(session, testDb, makeFetchMock() as unknown as typeof fetch);

    const cancelled = await testDb.sessions.get(sessionId);
    expect(cancelled?.endedAt).toBeNull();
    expect(cancelled?.deletedAt).not.toBeNull();
  });

  it("discards a session even once sets have been logged, unlike finalize", async () => {
    const sessionId = await startEmptySession(USER_ID, testDb);
    const sessionExercise: SessionExerciseRow = {
      id: uuidv7(),
      userId: USER_ID,
      sessionId,
      exerciseId: BENCH_ID,
      position: 0,
      supersetGroup: null,
      notes: null,
      stickyNote: null,
      restSeconds: null,
      warmupSets: null,
      updatedAt: new Date(),
      deviceId: "device-a",
      deletedAt: null,
      serverSeq: 0,
    };
    await testDb.sessionExercises.put(sessionExercise);
    await completeSet(
      {
        userId: USER_ID,
        sessionExerciseId: sessionExercise.id,
        exerciseId: BENCH_ID,
        setIndex: 0,
        kind: "working",
        weight: 135,
        reps: 5,
      },
      testDb,
    );
    const session = await testDb.sessions.get(sessionId);
    if (!session) throw new Error("session missing");

    const fetchMock = makeFetchMock();
    await cancelSession(session, testDb, fetchMock as unknown as typeof fetch);

    const cancelled = await testDb.sessions.get(sessionId);
    expect(cancelled?.endedAt).toBeNull();
    expect(cancelled?.deletedAt).not.toBeNull();
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("plate math for a barbell working set (against @jim/core)", () => {
  it("225 lb on a 45 lb bar with a standard plate set loads 2x45 per side", () => {
    const { perSide } = calculatePlateBreakdown(225, 45, [45, 35, 25, 10, 5, 2.5]);
    expect(perSide).toEqual([45, 45]);
  });
});

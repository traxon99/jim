import { resolveStickyNote, uuidv7 } from "@jim/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type JimDatabase,
  type SessionExerciseRow,
  type SessionRow,
  createTestDb,
} from "../../db/schema";
import { loadEarlierStickyNotes } from "../sticky-note";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const BENCH_ID = "22222222-2222-2222-2222-222222222222";
const SQUAT_ID = "33333333-3333-3333-3333-333333333333";

let testDb: JimDatabase;

beforeEach(() => {
  testDb = createTestDb(`jim-sticky-note-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await testDb.delete();
});

async function addWorkout(
  startedAt: string,
  exerciseId: string,
  stickyNote: string | null,
  overrides: { session?: Partial<SessionRow>; item?: Partial<SessionExerciseRow> } = {},
): Promise<string> {
  const sessionId = uuidv7();
  await testDb.sessions.put({
    id: sessionId,
    userId: USER_ID,
    routineId: null,
    name: null,
    startedAt: new Date(startedAt),
    endedAt: null,
    notes: null,
    bodyweight: null,
    intensity: null,
    deviceId: "device-a",
    updatedAt: new Date(startedAt),
    deletedAt: null,
    serverSeq: 0,
    ...overrides.session,
  });
  await testDb.sessionExercises.put({
    id: uuidv7(),
    userId: USER_ID,
    sessionId,
    exerciseId,
    position: 0,
    supersetGroup: null,
    notes: null,
    stickyNote,
    restSeconds: null,
    warmupSets: null,
    updatedAt: new Date(startedAt),
    deviceId: "device-a",
    deletedAt: null,
    serverSeq: 0,
    ...overrides.item,
  });
  return sessionId;
}

describe("loadEarlierStickyNotes", () => {
  it("carries the newest earlier note for the same exercise into a new workout", async () => {
    await addWorkout("2026-09-01", BENCH_ID, "Seat on 4");
    await addWorkout("2026-09-08", BENCH_ID, "Seat on 5");
    await addWorkout("2026-09-10", SQUAT_ID, "Belt on");
    const current = await addWorkout("2026-09-15", BENCH_ID, null);

    const earlier = await loadEarlierStickyNotes(BENCH_ID, current, testDb);
    expect(resolveStickyNote(null, earlier)).toBe("Seat on 5");
  });

  it("ignores the current workout, deleted rows and deleted workouts", async () => {
    await addWorkout("2026-09-01", BENCH_ID, "Keep");
    await addWorkout("2026-09-05", BENCH_ID, "Deleted row", { item: { deletedAt: new Date() } });
    await addWorkout("2026-09-06", BENCH_ID, "Cancelled", {
      session: { deletedAt: new Date() },
    });
    const current = await addWorkout("2026-09-15", BENCH_ID, "Own");

    const earlier = await loadEarlierStickyNotes(BENCH_ID, current, testDb);
    expect(earlier.map((source) => source.stickyNote)).toEqual(["Keep"]);
  });

  it("stops showing a note once a later workout cleared it", async () => {
    await addWorkout("2026-09-01", BENCH_ID, "Seat on 4");
    await addWorkout("2026-09-08", BENCH_ID, "");
    const current = await addWorkout("2026-09-15", BENCH_ID, null);

    const earlier = await loadEarlierStickyNotes(BENCH_ID, current, testDb);
    expect(resolveStickyNote(null, earlier)).toBeNull();
  });
});

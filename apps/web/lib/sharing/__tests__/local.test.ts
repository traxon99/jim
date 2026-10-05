import { DEFAULT_SETTINGS } from "@/lib/settings";
import { parseShareSnapshot } from "@jim/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ExerciseRow,
  type JimDatabase,
  type RoutineExerciseRow,
  type RoutineRow,
  createTestDb,
} from "../../db/schema";
import { shareIdFromText } from "../client";
import { addSharedSnapshot, buildProgramSnapshot, buildRoutineSnapshot } from "../local";

const SHARER = "11111111-1111-1111-1111-111111111111";
const RECIPIENT = "22222222-2222-2222-2222-222222222222";

let sharerDb: JimDatabase;
let recipientDb: JimDatabase;

beforeEach(() => {
  sharerDb = createTestDb(`jim-share-sharer-${crypto.randomUUID()}`);
  recipientDb = createTestDb(`jim-share-recipient-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await sharerDb.delete();
  await recipientDb.delete();
});

const stamp = { updatedAt: new Date(), deviceId: "", serverSeq: 0 };

function exercise(id: string, overrides: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id,
    ownerId: null,
    slug: id,
    name: id,
    aliases: [],
    primaryMuscles: ["chest"],
    secondaryMuscles: [],
    equipment: "barbell",
    mechanic: "compound",
    force: "push",
    level: "beginner",
    trackingType: "weight_reps",
    category: "strength",
    instructions: [],
    imageUrls: [],
    isArchived: false,
    createdAt: new Date(),
    ...stamp,
    ...overrides,
  };
}

function routine(id: string, overrides: Partial<RoutineRow> = {}): RoutineRow {
  return {
    id,
    userId: SHARER,
    name: id,
    notes: null,
    position: 0,
    folder: null,
    kind: "strength",
    warmupRoutineId: null,
    warmupMinutes: null,
    iconShape: "star",
    iconColor: "teal",
    createdAt: new Date(),
    deletedAt: null,
    ...stamp,
    ...overrides,
  };
}

function item(
  id: string,
  routineId: string,
  exerciseId: string,
  position: number,
  overrides: Partial<RoutineExerciseRow> = {},
): RoutineExerciseRow {
  return {
    id,
    userId: SHARER,
    routineId,
    exerciseId,
    position,
    supersetGroup: null,
    targetSets: 3,
    targetRepsLow: 6,
    targetRepsHigh: 10,
    targetRestSeconds: 90,
    targetDurationSeconds: null,
    targetWeight: "100.00",
    notes: null,
    deletedAt: null,
    ...stamp,
    ...overrides,
  };
}

async function seedSharer() {
  await sharerDb.exercises.bulkPut([
    exercise("g-bench", { slug: "bench-press", name: "Bench Press" }),
    exercise("g-row", { slug: "barbell-row", name: "Barbell Row" }),
    exercise("c-sled", { ownerId: SHARER, slug: "sled-push", name: "Sled Push" }),
  ]);
  await sharerDb.routines.bulkPut([
    routine("r-push", { name: "Push", warmupRoutineId: "r-warm" }),
    routine("r-pull", { name: "Pull" }),
    routine("r-warm", { name: "Warm", kind: "warmup", warmupMinutes: 5 }),
  ]);
  await sharerDb.routineExercises.bulkPut([
    item("i1", "r-push", "c-sled", 1, { notes: "Heavy" }),
    item("i2", "r-push", "g-bench", 0, { supersetGroup: 1 }),
    item("i3", "r-pull", "g-row", 0),
    item("i4", "r-warm", "g-row", 0, { targetWeight: null }),
  ]);
  await sharerDb.programs.put({
    id: "p1",
    userId: SHARER,
    name: "PPL",
    mode: "weekly",
    isActive: true,
    notes: null,
    position: 0,
    durationWeeks: 6,
    activatedAt: new Date(),
    createdAt: new Date(),
    deletedAt: null,
    ...stamp,
  });
  await sharerDb.programRoutines.bulkPut([
    {
      id: "pr1",
      userId: SHARER,
      programId: "p1",
      routineId: "r-push",
      position: 0,
      weekday: 1,
      deletedAt: null,
      ...stamp,
    },
    {
      id: "pr2",
      userId: SHARER,
      programId: "p1",
      routineId: null,
      position: 1,
      weekday: 2,
      deletedAt: null,
      ...stamp,
    },
    {
      id: "pr3",
      userId: SHARER,
      programId: "p1",
      routineId: "r-pull",
      position: 2,
      weekday: 3,
      deletedAt: null,
      ...stamp,
    },
  ]);
}

/** The recipient has the catalog lifts under their own ids, but not the custom one. */
async function seedRecipient() {
  await recipientDb.exercises.bulkPut([
    exercise("their-bench", { slug: "bench-press", name: "Bench Press" }),
    exercise("their-row", { slug: "barbell-row", name: "Barbell Row" }),
  ]);
}

/** A snapshot as it comes back from the server: through JSON and parsed again. */
function overTheWire<T>(value: T) {
  const parsed = parseShareSnapshot(JSON.parse(JSON.stringify(value)));
  if (!parsed) throw new Error("snapshot didn't parse");
  return parsed;
}

describe("share links on the phone (issue #254)", () => {
  it("adds a shared routine with its exercises, targets, order and warm-up", async () => {
    await seedSharer();
    await seedRecipient();
    const snapshot = overTheWire(await buildRoutineSnapshot("r-push", sharerDb));

    const added = await addSharedSnapshot(RECIPIENT, snapshot, recipientDb);
    if (added.kind !== "routine") throw new Error("expected a routine");

    const copy = await recipientDb.routines.get(added.routineId);
    expect(copy).toMatchObject({
      userId: RECIPIENT,
      name: "Push",
      iconShape: "star",
      folder: null,
    });
    const warmup = copy?.warmupRoutineId
      ? await recipientDb.routines.get(copy.warmupRoutineId)
      : null;
    expect(warmup).toMatchObject({ name: "Warm", kind: "warmup", warmupMinutes: 5 });

    const items = (
      await recipientDb.routineExercises.where("routineId").equals(added.routineId).toArray()
    ).sort((a, b) => a.position - b.position);
    const sled = (await recipientDb.exercises.toArray()).find((e) => e.name === "Sled Push");
    expect(sled).toMatchObject({ ownerId: RECIPIENT, slug: "sled-push" });
    expect(items.map((i) => i.exerciseId)).toEqual(["their-bench", sled?.id]);
    expect(items[0]).toMatchObject({
      userId: RECIPIENT,
      supersetGroup: 1,
      targetSets: 3,
      targetRepsLow: 6,
      targetRepsHigh: 10,
      targetRestSeconds: 90,
      targetWeight: "100",
    });
    expect(items[1]?.notes).toBe("Heavy");

    // Every write is queued to sync, like the user's own edits.
    const queued = await recipientDb.outbox.toArray();
    expect(queued.filter((m) => m.table === "routines")).toHaveLength(2);
    expect(queued.filter((m) => m.table === "exercises")).toHaveLength(1);
  });

  it("isn't changed by the sharer's later edits", async () => {
    await seedSharer();
    const snapshot = overTheWire(await buildRoutineSnapshot("r-push", sharerDb));
    await sharerDb.routines.update("r-push", { name: "Renamed" });
    await sharerDb.routineExercises.update("i2", { targetSets: 9 });
    expect(snapshot.routines[0]?.name).toBe("Push");
    expect(snapshot.routines[0]?.items[0]?.targetSets).toBe(3);
  });

  it("adds a shared program with its schedule and rest days, filed under its name", async () => {
    await seedSharer();
    await seedRecipient();
    const snapshot = overTheWire(await buildProgramSnapshot("p1", sharerDb));

    const added = await addSharedSnapshot(RECIPIENT, snapshot, recipientDb);
    if (added.kind !== "program") throw new Error("expected a program");

    const program = await recipientDb.programs.get(added.programId);
    expect(program).toMatchObject({
      name: "PPL",
      mode: "weekly",
      isActive: false,
      durationWeeks: 6,
    });
    const entries = (
      await recipientDb.programRoutines.where("programId").equals(added.programId).toArray()
    ).sort((a, b) => a.position - b.position);
    const routinesById = new Map((await recipientDb.routines.toArray()).map((r) => [r.id, r]));
    expect(
      entries.map((e) => [e.weekday, e.routineId ? routinesById.get(e.routineId)?.name : null]),
    ).toEqual([
      [1, "Push"],
      [2, null],
      [3, "Pull"],
    ]);
    expect([...routinesById.values()].every((r) => r.folder === "PPL")).toBe(true);
  });

  it("converts starting weights into the recipient's units", async () => {
    await seedSharer();
    await seedRecipient();
    await recipientDb.settings.put({ ...DEFAULT_SETTINGS, units: "kg" });
    const snapshot = overTheWire(await buildRoutineSnapshot("r-pull", sharerDb));

    const added = await addSharedSnapshot(RECIPIENT, snapshot, recipientDb);
    if (added.kind !== "routine") throw new Error("expected a routine");
    const [row] = await recipientDb.routineExercises
      .where("routineId")
      .equals(added.routineId)
      .toArray();
    expect(row?.targetWeight).toBe("45");
  });
});

describe("shareIdFromText", () => {
  const id = "0b5c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d";

  it("finds the id in a pasted link or on its own", () => {
    expect(shareIdFromText(`https://jim.example/share/${id}`)).toBe(id);
    expect(shareIdFromText(` https://jim.example/share/${id.toUpperCase()}?x=1 `)).toBe(id);
    expect(shareIdFromText(id)).toBe(id);
  });

  it("rejects anything else", () => {
    expect(shareIdFromText("https://jim.example/routines/abc")).toBeNull();
    expect(shareIdFromText(`https://jim.example/share/${id}extra`)).toBeNull();
    expect(shareIdFromText("")).toBeNull();
  });
});

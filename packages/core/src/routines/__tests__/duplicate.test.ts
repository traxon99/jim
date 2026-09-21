import { describe, expect, it } from "vitest";
import { duplicateRoutine } from "../duplicate";

const USER_A = "user-a";

interface TestRoutine {
  id: string;
  userId: string;
  name: string;
  folder: string | null;
}

interface TestItem {
  id: string;
  userId: string;
  routineId: string;
  exerciseId: string;
  targetSets: number | null;
}

function idSequence(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

describe("duplicateRoutine", () => {
  it("gives the duplicate routine and every item a fresh id", () => {
    const routine: TestRoutine = { id: "r1", userId: USER_A, name: "Push day", folder: null };
    const items: TestItem[] = [
      { id: "i1", userId: USER_A, routineId: "r1", exerciseId: "bench", targetSets: 5 },
      { id: "i2", userId: USER_A, routineId: "r1", exerciseId: "ohp", targetSets: 3 },
    ];

    const { routine: newRoutine, items: newItems } = duplicateRoutine(
      routine,
      items,
      USER_A,
      idSequence("new"),
    );

    expect(newRoutine.id).not.toBe(routine.id);
    expect(newItems.map((i) => i.id)).not.toEqual(items.map((i) => i.id));
    expect(new Set(newItems.map((i) => i.id)).size).toBe(2);
  });

  it("points every duplicated item at the new routine, not the original", () => {
    const routine: TestRoutine = { id: "r1", userId: USER_A, name: "Push day", folder: null };
    const items: TestItem[] = [
      { id: "i1", userId: USER_A, routineId: "r1", exerciseId: "bench", targetSets: 5 },
    ];

    const { routine: newRoutine, items: newItems } = duplicateRoutine(
      routine,
      items,
      USER_A,
      idSequence("new"),
    );

    expect(newItems[0]?.routineId).toBe(newRoutine.id);
    expect(newItems[0]?.routineId).not.toBe(routine.id);
  });

  it("does not alias the original routine or item objects", () => {
    const routine: TestRoutine = { id: "r1", userId: USER_A, name: "Push day", folder: null };
    const items: TestItem[] = [
      { id: "i1", userId: USER_A, routineId: "r1", exerciseId: "bench", targetSets: 5 },
    ];

    const { routine: newRoutine, items: newItems } = duplicateRoutine(
      routine,
      items,
      USER_A,
      idSequence("new"),
    );

    expect(newRoutine).not.toBe(routine);
    expect(newItems[0]).not.toBe(items[0]);

    // Mutating the copy must never touch the original (STORIES.md S5:
    // "without aliasing the original").
    const copy = newItems[0];
    expect(copy).toBeDefined();
    if (copy) copy.targetSets = 99;
    expect(items[0]?.targetSets).toBe(5);
  });

  it("carries target fields and exerciseId through unchanged", () => {
    const routine: TestRoutine = { id: "r1", userId: USER_A, name: "Push day", folder: null };
    const items: TestItem[] = [
      { id: "i1", userId: USER_A, routineId: "r1", exerciseId: "bench", targetSets: 5 },
    ];

    const { items: newItems } = duplicateRoutine(routine, items, USER_A, idSequence("new"));

    expect(newItems[0]?.exerciseId).toBe("bench");
    expect(newItems[0]?.targetSets).toBe(5);
  });

  it("appends 'copy' to the duplicated routine's name", () => {
    const routine: TestRoutine = { id: "r1", userId: USER_A, name: "Push day", folder: null };
    const { routine: newRoutine } = duplicateRoutine(routine, [], USER_A, idSequence("new"));
    expect(newRoutine.name).toBe("Push day copy");
  });

  it("stamps userId onto the duplicate even when duplicating someone else's owned rows", () => {
    const routine: TestRoutine = { id: "r1", userId: "user-b", name: "Push day", folder: null };
    const { routine: newRoutine } = duplicateRoutine(routine, [], USER_A, idSequence("new"));
    expect(newRoutine.userId).toBe(USER_A);
  });
});

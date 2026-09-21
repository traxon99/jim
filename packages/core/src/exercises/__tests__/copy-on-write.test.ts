import { describe, expect, it } from "vitest";
import { applyExerciseEdit } from "../copy-on-write";

const USER_A = "user-a";

interface Row {
  id: string;
  ownerId: string | null;
  name: string;
  isArchived: boolean;
}

describe("applyExerciseEdit", () => {
  it("clones a global row rather than updating it in place", () => {
    const global: Row = { id: "global-1", ownerId: null, name: "Barbell Squat", isArchived: false };

    const result = applyExerciseEdit(global, { name: "My Squat" }, USER_A, () => "new-id");

    expect(result.action).toBe("clone");
    expect(result.entity).toEqual({
      id: "new-id",
      ownerId: USER_A,
      name: "My Squat",
      isArchived: false,
    });
  });

  it("never mutates the source object passed in", () => {
    const global: Row = { id: "global-1", ownerId: null, name: "Barbell Squat", isArchived: false };
    applyExerciseEdit(global, { name: "My Squat" }, USER_A, () => "new-id");
    expect(global.name).toBe("Barbell Squat");
  });

  it("updates an already-owned row in place, keeping its id and owner", () => {
    const owned: Row = { id: "clone-1", ownerId: USER_A, name: "My Squat", isArchived: false };

    const result = applyExerciseEdit(owned, { name: "My Squat v2" }, USER_A, () => "unused");

    expect(result).toEqual({
      action: "update",
      entity: { id: "clone-1", ownerId: USER_A, name: "My Squat v2", isArchived: false },
    });
  });

  it("treats archiving a global exercise as archived-for-me: a clone, not a mutation", () => {
    const global: Row = { id: "global-1", ownerId: null, name: "Sled Push", isArchived: false };

    const result = applyExerciseEdit(global, { isArchived: true }, USER_A, () => "new-id");

    expect(result.action).toBe("clone");
    expect(result.entity.isArchived).toBe(true);
    expect(result.entity.id).not.toBe("global-1");
  });

  it("clones rather than updates for any owner that isn't the current user", () => {
    const foreign: Row = { id: "other-1", ownerId: "user-b", name: "X", isArchived: false };
    const result = applyExerciseEdit(foreign, {}, USER_A, () => "new-id");
    expect(result.action).toBe("clone");
    expect(result.entity.ownerId).toBe(USER_A);
  });
});

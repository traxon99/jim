import { describe, expect, it } from "vitest";
import { isFocusExerciseComplete } from "../../sessions/focus-exercise";
import {
  leaveSuperset,
  nextSupersetGroup,
  normalizeSupersets,
  setSupersetLink,
  supersetBlocks,
  supersetFollowUp,
  supersetLabels,
  supersetLinks,
} from "../supersets";

function items(...groups: (number | null)[]) {
  return groups.map((supersetGroup, i) => ({ id: String.fromCharCode(97 + i), supersetGroup }));
}

describe("supersetLinks", () => {
  it("links neighbours that share a non-null group", () => {
    expect(supersetLinks(items(1, 1, null, 2, 2, 2))).toEqual([true, false, false, true, true]);
  });

  it("doesn't link two ungrouped neighbours", () => {
    expect(supersetLinks(items(null, null))).toEqual([false]);
  });

  it("doesn't link non-adjacent items that share a group", () => {
    expect(supersetLinks(items(1, null, 1))).toEqual([false, false]);
  });
});

describe("setSupersetLink", () => {
  it("links two plain exercises into a new superset", () => {
    expect(setSupersetLink(items(null, null, null), 0, true)).toEqual([
      { id: "a", supersetGroup: 1 },
      { id: "b", supersetGroup: 1 },
    ]);
  });

  it("extends an existing superset to the next exercise", () => {
    expect(setSupersetLink(items(1, 1, null), 1, true)).toEqual([{ id: "c", supersetGroup: 1 }]);
  });

  it("merges two supersets when the link between them is made", () => {
    expect(setSupersetLink(items(1, 1, 2, 2), 1, true)).toEqual([
      { id: "c", supersetGroup: 1 },
      { id: "d", supersetGroup: 1 },
    ]);
  });

  it("splits a superset, clearing a member left on its own", () => {
    expect(setSupersetLink(items(1, 1, 1), 0, false)).toEqual([{ id: "a", supersetGroup: null }]);
  });

  it("splits a superset in the middle into two", () => {
    expect(setSupersetLink(items(1, 1, 1, 1), 1, false)).toEqual([
      { id: "c", supersetGroup: 2 },
      { id: "d", supersetGroup: 2 },
    ]);
  });

  it("ignores an index with no next item", () => {
    expect(setSupersetLink(items(null, null), 1, true)).toEqual([]);
  });
});

describe("leaveSuperset", () => {
  it("takes the middle member out, splitting what's left", () => {
    expect(leaveSuperset(items(1, 1, 1), 1)).toEqual([
      { id: "a", supersetGroup: null },
      { id: "b", supersetGroup: null },
      { id: "c", supersetGroup: null },
    ]);
  });

  it("takes the last member out, keeping the rest together", () => {
    expect(leaveSuperset(items(1, 1, 1), 2)).toEqual([{ id: "c", supersetGroup: null }]);
  });

  it("takes the first member out, keeping the rest together", () => {
    expect(leaveSuperset(items(null, 1, 1, 1), 1)).toEqual([{ id: "b", supersetGroup: null }]);
  });

  it("changes nothing for an exercise not in a superset", () => {
    expect(leaveSuperset(items(null, 1, 1), 0)).toEqual([]);
  });
});

describe("nextSupersetGroup", () => {
  it("is one past the highest group in use", () => {
    expect(nextSupersetGroup(items(null, 3, 3, 1, 1))).toBe(4);
  });

  it("starts at 1 with no supersets", () => {
    expect(nextSupersetGroup(items(null, null))).toBe(1);
    expect(nextSupersetGroup([])).toBe(1);
  });
});

describe("normalizeSupersets", () => {
  it("clears a group whose other members were moved away", () => {
    expect(normalizeSupersets(items(1, null, 1))).toEqual([
      { id: "a", supersetGroup: null },
      { id: "c", supersetGroup: null },
    ]);
  });

  it("gives each run its own group number", () => {
    expect(normalizeSupersets(items(5, 5, null, 5, 5))).toEqual([
      { id: "a", supersetGroup: 1 },
      { id: "b", supersetGroup: 1 },
      { id: "d", supersetGroup: 2 },
      { id: "e", supersetGroup: 2 },
    ]);
  });

  it("changes nothing when the groups already match", () => {
    expect(normalizeSupersets(items(1, 1, null))).toEqual([]);
  });
});

describe("supersetBlocks and supersetLabels", () => {
  it("groups each superset into one block, lettering only supersets", () => {
    const blocks = supersetBlocks(items(null, 1, 1, null, 2, 2, 2));
    expect(blocks.map((b) => [b.letter, b.items.map((i) => i.id).join("")])).toEqual([
      [null, "a"],
      ["A", "bc"],
      [null, "d"],
      ["B", "efg"],
    ]);
  });

  it("labels superset members A1, A2, …", () => {
    expect([...supersetLabels(items(1, 1, null, 2, 2))]).toEqual([
      ["a", "A1"],
      ["b", "A2"],
      ["d", "B1"],
      ["e", "B2"],
    ]);
  });
});

describe("supersetFollowUp", () => {
  function exercises(...rows: [number | null, number, number | null][]) {
    return rows.map(([supersetGroup, loggedSetCount, targetSetCount], i) => ({
      id: String.fromCharCode(97 + i),
      supersetGroup,
      loggedSetCount,
      targetSetCount,
    }));
  }

  function followUp(list: ReturnType<typeof exercises>, id: string) {
    const byId = new Map(list.map((item) => [item.id, item]));
    return supersetFollowUp(list, id, (itemId) => {
      const item = byId.get(itemId);
      return item != null && isFocusExerciseComplete(item);
    });
  }

  it("rests as usual outside a superset", () => {
    expect(followUp(exercises([null, 1, 3], [null, 0, 3]), "a")).toEqual({
      rest: true,
      nextId: null,
    });
  });

  it("goes straight to the next member without resting mid-round", () => {
    expect(followUp(exercises([1, 1, 3], [1, 0, 3]), "a")).toEqual({
      rest: false,
      nextId: "b",
    });
  });

  it("rests after the round and returns to the first member", () => {
    expect(followUp(exercises([1, 1, 3], [1, 1, 3]), "b")).toEqual({
      rest: true,
      nextId: "a",
    });
  });

  it("skips members that are already done", () => {
    expect(followUp(exercises([1, 2, 3], [1, 3, 3], [1, 2, 3]), "a")).toEqual({
      rest: false,
      nextId: "c",
    });
  });

  it("has nowhere to go once every member is done", () => {
    expect(followUp(exercises([1, 3, 3], [1, 3, 3], [null, 0, 3]), "b")).toEqual({
      rest: true,
      nextId: null,
    });
  });
});

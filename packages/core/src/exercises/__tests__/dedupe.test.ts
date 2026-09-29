import { describe, expect, it } from "vitest";
import { dedupeCatalogNames, preferOwnedExercises } from "../dedupe";
import type { CatalogExercise } from "../types";

const USER_A = "user-a";

function exercise(
  overrides: Partial<CatalogExercise> & { id: string; slug: string },
): CatalogExercise {
  return {
    name: overrides.id,
    aliases: [],
    ownerId: null,
    isArchived: false,
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: null,
    ...overrides,
  };
}

describe("preferOwnedExercises", () => {
  it("prefers the user's clone over the global row sharing its slug (ADR-008)", () => {
    const global = exercise({ id: "global-1", slug: "bench-press", ownerId: null });
    const clone = exercise({ id: "clone-1", slug: "bench-press", ownerId: USER_A });

    const result = preferOwnedExercises([global, clone], USER_A);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("clone-1");
  });

  it("keeps the global row when the user has no clone for that slug", () => {
    const global = exercise({ id: "global-1", slug: "squat", ownerId: null });
    const result = preferOwnedExercises([global], USER_A);
    expect(result.map((e) => e.id)).toEqual(["global-1"]);
  });

  it("never prefers another user's row over the global one", () => {
    const global = exercise({ id: "global-1", slug: "squat", ownerId: null });
    const othersClone = exercise({ id: "clone-2", slug: "squat", ownerId: "user-b" });

    const result = preferOwnedExercises([global, othersClone], USER_A);

    expect(result.map((e) => e.id).sort()).toEqual(["clone-2", "global-1"]);
  });

  it("passes through unrelated exercises with distinct slugs untouched", () => {
    const a = exercise({ id: "a", slug: "bench-press" });
    const b = exercise({ id: "b", slug: "squat" });
    expect(preferOwnedExercises([a, b], USER_A)).toHaveLength(2);
  });
});

describe("dedupeCatalogNames", () => {
  const stretch = exercise({ id: "fedb", slug: "ankle-circles", name: "Ankle Circles" });
  const warmup = exercise({ id: "wu", slug: "warmup-ankle-circles", name: "Ankle Circles" });
  const bench = exercise({ id: "bench", slug: "bench-press", name: "Bench Press" });

  it("keeps one global row per name, preferring the curated warm-up", () => {
    expect(dedupeCatalogNames([stretch, bench, warmup]).map((e) => e.id)).toEqual(["bench", "wu"]);
  });

  it("prefers the row the user has logged", () => {
    expect(dedupeCatalogNames([stretch, warmup], new Set(["fedb"])).map((e) => e.id)).toEqual([
      "fedb",
    ]);
  });

  it("matches names case-insensitively and never folds away the user's own", () => {
    const mine = exercise({
      id: "mine",
      slug: "my-ankle-circles",
      name: "ankle circles",
      ownerId: USER_A,
    });
    const shouty = exercise({ id: "shouty", slug: "ankle-circles-2", name: "ANKLE CIRCLES" });
    expect(dedupeCatalogNames([stretch, shouty, mine]).map((e) => e.id)).toEqual(["fedb", "mine"]);
  });
});

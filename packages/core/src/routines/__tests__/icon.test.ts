import { describe, expect, it } from "vitest";
import {
  ROUTINE_ICON_COLORS,
  ROUTINE_ICON_COMBOS,
  ROUTINE_ICON_SHAPES,
  type RoutineIcon,
  pickDefaultRoutineIcon,
} from "../icon";

const key = (icon: RoutineIcon) => `${icon.iconShape}:${icon.iconColor}`;

/** Deterministic PRNG so the randomized property tests are reproducible. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

describe("ROUTINE_ICON_COMBOS", () => {
  it("has at least 20 unique shape/color combinations", () => {
    expect(ROUTINE_ICON_COMBOS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(ROUTINE_ICON_COMBOS.map(key)).size).toBe(ROUTINE_ICON_COMBOS.length);
  });

  it("covers every shape and color exactly once per pairing", () => {
    expect(ROUTINE_ICON_COMBOS.length).toBe(
      ROUTINE_ICON_SHAPES.length * ROUTINE_ICON_COLORS.length,
    );
  });

  it("keeps the original shapes so existing rows stay valid", () => {
    expect(ROUTINE_ICON_SHAPES).toEqual(expect.arrayContaining(["square", "triangle", "squircle"]));
  });
});

describe("pickDefaultRoutineIcon", () => {
  it("returns a valid combo when nothing is in use yet", () => {
    const picked = pickDefaultRoutineIcon([], seeded(1));
    expect(ROUTINE_ICON_COMBOS.map(key)).toContain(key(picked));
  });

  it("is random rather than always the same first combo", () => {
    const picks = new Set(
      Array.from({ length: 20 }, (_, i) => key(pickDefaultRoutineIcon([], seeded(i + 1)))),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it("uses the injected random source to index into the candidates", () => {
    expect(pickDefaultRoutineIcon([], () => 0)).toEqual(ROUTINE_ICON_COMBOS[0]);
    expect(pickDefaultRoutineIcon([], () => 0.999999)).toEqual(ROUTINE_ICON_COMBOS.at(-1));
  });

  it("never repeats the previous routine's shape or color while alternatives exist", () => {
    const previous: RoutineIcon = { iconShape: "circle", iconColor: "blue" };
    for (let seed = 1; seed <= 200; seed++) {
      const picked = pickDefaultRoutineIcon([previous], seeded(seed));
      expect(picked.iconShape).not.toBe(previous.iconShape);
      expect(picked.iconColor).not.toBe(previous.iconColor);
    }
  });

  it("only looks at the last entry as the previous icon", () => {
    const older: RoutineIcon = { iconShape: "star", iconColor: "red" };
    const previous: RoutineIcon = { iconShape: "square", iconColor: "green" };
    const picked = pickDefaultRoutineIcon([older, previous], () => 0);
    expect(picked.iconShape).not.toBe("square");
    expect(picked.iconColor).not.toBe("green");
  });

  it("never picks a combo already in use while unused ones remain", () => {
    const rng = seeded(7);
    const existing: RoutineIcon[] = [];
    for (let i = 0; i < ROUTINE_ICON_COMBOS.length; i++) {
      const picked = pickDefaultRoutineIcon(existing, rng);
      expect(existing.map(key)).not.toContain(key(picked));
      existing.push(picked);
    }
    expect(new Set(existing.map(key)).size).toBe(ROUTINE_ICON_COMBOS.length);
  });

  it("falls back to an unused combo when every unused one shares a trait with the previous", () => {
    const remaining: RoutineIcon = { iconShape: "hexagon", iconColor: "teal" };
    const previous: RoutineIcon = { iconShape: "hexagon", iconColor: "pink" };
    const existing = ROUTINE_ICON_COMBOS.filter(
      (c) => key(c) !== key(remaining) && key(c) !== key(previous),
    ).concat(previous);
    expect(pickDefaultRoutineIcon(existing, seeded(3))).toEqual(remaining);
  });

  it("still differs from the previous icon once every combo is taken", () => {
    const previous: RoutineIcon = { iconShape: "triangle", iconColor: "amber" };
    const existing = [...ROUTINE_ICON_COMBOS, previous];
    for (let seed = 1; seed <= 50; seed++) {
      const picked = pickDefaultRoutineIcon(existing, seeded(seed));
      expect(picked.iconShape).not.toBe(previous.iconShape);
      expect(picked.iconColor).not.toBe(previous.iconColor);
    }
  });
});

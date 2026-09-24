import { describe, expect, it } from "vitest";
import {
  ROUTINE_ICON_COLORS,
  ROUTINE_ICON_COMBOS,
  ROUTINE_ICON_SHAPES,
  pickDefaultRoutineIcon,
} from "../icon";

const FIRST = { iconShape: "square", iconColor: "red" } as const;
const SECOND = { iconShape: "square", iconColor: "orange" } as const;
const THIRD = { iconShape: "square", iconColor: "amber" } as const;

describe("ROUTINE_ICON_COMBOS", () => {
  it("has at least 20 unique shape/color combinations", () => {
    expect(ROUTINE_ICON_COMBOS.length).toBeGreaterThanOrEqual(20);
    const keys = new Set(ROUTINE_ICON_COMBOS.map((c) => `${c.iconShape}:${c.iconColor}`));
    expect(keys.size).toBe(ROUTINE_ICON_COMBOS.length);
  });

  it("covers every shape and color exactly once per pairing", () => {
    expect(ROUTINE_ICON_COMBOS.length).toBe(
      ROUTINE_ICON_SHAPES.length * ROUTINE_ICON_COLORS.length,
    );
  });

  it("starts with the fixed combos the other tests assume", () => {
    expect([ROUTINE_ICON_COMBOS[0], ROUTINE_ICON_COMBOS[1], ROUTINE_ICON_COMBOS[2]]).toEqual([
      FIRST,
      SECOND,
      THIRD,
    ]);
  });
});

describe("pickDefaultRoutineIcon", () => {
  it("picks the first combo when nothing is in use yet", () => {
    expect(pickDefaultRoutineIcon([])).toEqual(FIRST);
  });

  it("skips combos already worn by existing routines", () => {
    expect(pickDefaultRoutineIcon([FIRST, SECOND])).toEqual(THIRD);
  });

  it("ignores order and only cares which combos are taken", () => {
    expect(pickDefaultRoutineIcon([THIRD, FIRST])).toEqual(SECOND);
  });

  it("cycles back through the list once every combo is taken", () => {
    expect(pickDefaultRoutineIcon(ROUTINE_ICON_COMBOS)).toEqual(FIRST);
  });
});

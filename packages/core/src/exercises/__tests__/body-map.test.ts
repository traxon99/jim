import { describe, expect, it } from "vitest";
import { exerciseMuscleShading, heatmapShading } from "../body-map";

describe("exerciseMuscleShading", () => {
  it("shades primary muscles fully and secondary ones lighter", () => {
    expect(
      exerciseMuscleShading({ primaryMuscles: ["chest"], secondaryMuscles: ["triceps"] }),
    ).toEqual({ chest: 1, triceps: 0.45 });
  });

  it("lets primary win when a muscle is listed as both", () => {
    expect(
      exerciseMuscleShading({ primaryMuscles: ["chest"], secondaryMuscles: ["chest"] }),
    ).toEqual({ chest: 1 });
  });
});

describe("heatmapShading", () => {
  it("scales values against the shared max, with a floor for any trained muscle", () => {
    expect(heatmapShading({ chest: 10, lats: 5, biceps: 0.5, calves: 0 }, 10)).toEqual({
      chest: 1,
      lats: 0.5,
      biceps: 0.15,
    });
  });

  it("returns nothing when there's nothing to scale against", () => {
    expect(heatmapShading({ chest: 3 }, 0)).toEqual({});
  });
});

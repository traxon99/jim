import { describe, expect, it } from "vitest";
import { bodyMapView, exerciseMuscleShading, heatmapShading } from "../body-map";

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

describe("bodyMapView", () => {
  it("crops to the upper body when every shaded muscle is up there", () => {
    expect(bodyMapView({ biceps: 1, forearms: 0.45 })).toBe("upper");
    expect(bodyMapView({ abdominals: 1, "lower back": 0.45 })).toBe("upper");
  });

  it("crops to the lower body when every shaded muscle is down there", () => {
    expect(bodyMapView({ quadriceps: 1, glutes: 0.45, calves: 0.45 })).toBe("lower");
  });

  it("keeps the whole body when the muscles span both halves", () => {
    expect(bodyMapView({ hamstrings: 1, "lower back": 0.45 })).toBe("full");
  });

  it("keeps the whole body when nothing is shaded", () => {
    expect(bodyMapView({})).toBe("full");
    expect(bodyMapView({ chest: 0 })).toBe("full");
  });
});

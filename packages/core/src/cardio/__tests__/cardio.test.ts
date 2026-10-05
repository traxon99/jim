import { describe, expect, it } from "vitest";
import { isCardioExercise, isStrengthExercise, isWarmupExercise } from "../../warmups/category";
import { CARDIO_EXERCISES } from "../catalog";
import {
  distanceUnitFor,
  formatCardioSet,
  formatDistance,
  formatDuration,
  formatPace,
  formatTimedSet,
} from "../format";
import { EMPTY_CARDIO_BESTS, computeCardioBests, detectCardioRecords } from "../records";

describe("cardio category", () => {
  it("reads cardio as its own category, out of strength volume", () => {
    expect(isCardioExercise({ category: "cardio" })).toBe(true);
    expect(isStrengthExercise({ category: "cardio" })).toBe(false);
    expect(isWarmupExercise({ category: "cardio" })).toBe(false);
    expect(isStrengthExercise({})).toBe(true);
  });
});

describe("CARDIO_EXERCISES", () => {
  it("has unique cardio- slugs and includes Boxing (Bag)", () => {
    const slugs = CARDIO_EXERCISES.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((slug) => slug.startsWith("cardio-"))).toBe(true);
    expect(CARDIO_EXERCISES.some((e) => e.name === "Boxing (Bag)")).toBe(true);
  });
});

describe("cardio formatting", () => {
  it("picks km for kg users and miles otherwise", () => {
    expect(distanceUnitFor("kg")).toBe("km");
    expect(distanceUnitFor("lb")).toBe("mi");
    expect(distanceUnitFor(null)).toBe("mi");
  });

  it("formats durations as m:ss or h:mm:ss", () => {
    expect(formatDuration(180)).toBe("3:00");
    expect(formatDuration(1507)).toBe("25:07");
    expect(formatDuration(3723)).toBe("1:02:03");
  });

  it("formats distances without trailing zeros", () => {
    expect(formatDistance(5, "km")).toBe("5 km");
    expect(formatDistance(3.1, "mi")).toBe("3.1 mi");
  });

  it("formats pace only with both a distance and a time", () => {
    expect(formatPace(1500, 5, "km")).toBe("5:00 /km");
    expect(formatPace(1500, null, "km")).toBeNull();
    expect(formatPace(null, 5, "km")).toBeNull();
  });

  it("formats a set from stored string distances", () => {
    expect(formatCardioSet({ distance: "5.00", durationSeconds: 1500 }, "km")).toBe("5 km · 25:00");
    expect(formatCardioSet({ distance: null, durationSeconds: 180 }, "mi")).toBe("3:00");
    expect(formatCardioSet({ distance: null, durationSeconds: null }, "mi")).toBe("—");
  });
});

describe("formatTimedSet", () => {
  it("keeps short holds in seconds and longer times in m:ss", () => {
    expect(formatTimedSet({ distance: null, durationSeconds: 45 }, "mi")).toBe("45s");
    expect(formatTimedSet({ distance: null, durationSeconds: 180 }, "mi")).toBe("3:00");
    expect(formatTimedSet({ distance: "2", durationSeconds: null }, "km")).toBe("2 km");
    expect(formatTimedSet({ distance: null, durationSeconds: null }, "km")).toBeNull();
  });
});

describe("cardio records", () => {
  const history = [
    { distance: "5", durationSeconds: 1500 }, // 5:00 /km
    { distance: "3", durationSeconds: 1200 }, // 6:40 /km
    { distance: null, durationSeconds: 1800 },
  ];

  it("folds longest distance, longest time and fastest pace", () => {
    expect(computeCardioBests(history)).toEqual({
      distance: 5,
      durationSeconds: 1800,
      paceSeconds: 300,
    });
  });

  it("detects each record a set beats", () => {
    const prior = computeCardioBests(history);
    expect(detectCardioRecords({ distance: "6", durationSeconds: 1740 }, prior)).toEqual([
      "distance",
      "pace",
    ]);
    expect(detectCardioRecords({ distance: null, durationSeconds: 2000 }, prior)).toEqual([
      "duration",
    ]);
    expect(detectCardioRecords({ distance: "1", durationSeconds: 600 }, prior)).toEqual([]);
  });

  it("doesn't celebrate a first-ever value", () => {
    expect(
      detectCardioRecords({ distance: "5", durationSeconds: 1500 }, EMPTY_CARDIO_BESTS),
    ).toEqual([]);
  });
});

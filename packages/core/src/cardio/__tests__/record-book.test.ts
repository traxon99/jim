import { describe, expect, it } from "vitest";
import { deriveAchievements } from "../../history/achievements";
import { durationDigitsText, durationFromDigits } from "../format";
import {
  cardioDistanceValue,
  cardioInputToDistance,
  cardioKindOf,
  cardioMetricLabel,
  cardioMetricValue,
  cardioProfile,
  formatCardioSetFor,
} from "../kind";
import {
  type CardioRecordSet,
  buildCardioRecordBook,
  cardioRecordLabel,
  formatCardioRecordValue,
} from "../record-book";

describe("cardioKindOf", () => {
  it.each([
    ["Running (Outdoor)", "cardio-running-outdoor", "run"],
    ["Running, Treadmill", "running-treadmill", "run"],
    ["Trail Running/Walking", "trail-running-walking", "run"],
    ["Walking, Treadmill", "walking-treadmill", "walk"],
    ["Incline Walk", "cardio-incline-walk", "walk"],
    ["Bicycling, Stationary", "bicycling-stationary", "ride"],
    ["Assault Bike", "cardio-assault-bike", "ride"],
    ["Rowing, Stationary", "rowing-stationary", "row"],
    ["SkiErg", "cardio-skierg", "ski"],
    ["Swimming", "cardio-swimming", "swim"],
    ["Elliptical Trainer", "elliptical-trainer", "elliptical"],
    ["Stairmaster", "stairmaster", "stairs"],
    ["Step Mill", "step-mill", "stairs"],
    ["Boxing (Bag)", "cardio-boxing-bag", "boxing"],
    ["Rope Jumping", "rope-jumping", "rope"],
    ["Skating", "skating", "other"],
  ])("%s is %s", (name, slug, kind) => {
    expect(cardioKindOf({ name, slug })).toBe(kind);
  });
});

describe("per-kind units", () => {
  it("rows and swims are entered in meters and keep them across mi storage", () => {
    const row = cardioProfile("row");
    const stored = cardioInputToDistance(2000, "mi", row);
    expect(stored).toBe(1.2427);
    expect(cardioDistanceValue(stored, "mi", row)).toBe("2,000");
    expect(cardioMetricLabel(row, "mi")).toBe("/500m");
    expect(cardioMetricValue(485, stored, "mi", row)).toBe("2:01");
    expect(formatCardioSetFor({ distance: stored, durationSeconds: 485 }, "mi", row)).toBe(
      "2,000 m · 8:05",
    );
  });

  it("swims show time per 100 m, rides show speed, runs show pace", () => {
    const swim = cardioProfile("swim");
    expect(cardioMetricValue(102, cardioInputToDistance(100, "km", swim), "km", swim)).toBe("1:42");
    const ride = cardioProfile("ride");
    expect(cardioMetricLabel(ride, "mi")).toBe("mph");
    expect(cardioMetricValue(3600, 16.3, "mi", ride)).toBe("16.3");
    const run = cardioProfile("run");
    expect(cardioMetricValue(1565, 3.1, "mi", run)).toBe("8:25");
  });
});

function set(id: string, day: number, distance: number | null, seconds: number, group = id) {
  return {
    id,
    groupId: group,
    completedAt: new Date(2026, 10, day),
    distance,
    durationSeconds: seconds,
  } satisfies CardioRecordSet;
}

describe("buildCardioRecordBook", () => {
  it("finds standard-distance bests and never calls a slower run a record", () => {
    const book = buildCardioRecordBook(
      [set("a", 1, 3.1, 1720), set("b", 2, 3.1, 1800), set("c", 3, 3.12, 1565)],
      "run",
      "mi",
      true,
    );
    expect(book.bySet.get("b")).toBeUndefined();
    expect(book.bySet.get("c")).toEqual(["distance", "pace", "std:5k"]);
    const fiveK = book.bests.get("std:5k");
    expect(fiveK?.setId).toBe("c");
    expect(formatCardioRecordValue("std:5k", fiveK?.value ?? 0, "mi", cardioProfile("run"))).toBe(
      "25:58",
    );
  });

  it("keeps longest time for time-only cardio", () => {
    const book = buildCardioRecordBook(
      [set("a", 1, null, 1500), set("b", 2, null, 1920)],
      "stairs",
      "mi",
      false,
    );
    expect(book.bySet.get("b")).toEqual(["duration"]);
    expect(cardioRecordLabel("duration", cardioProfile("stairs"))).toBe("Longest climb");
  });

  it("counts bag rounds per workout and flags the round that passes the best", () => {
    const rounds = (prefix: string, day: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        ...set(`${prefix}${i}`, day, null, 180, prefix),
        completedAt: new Date(2026, 10, day, 18, i),
      }));
    const book = buildCardioRecordBook(
      [...rounds("w1-", 1, 3), ...rounds("w2-", 2, 5)],
      "boxing",
      "mi",
      false,
    );
    expect(book.bests.get("rounds")?.value).toBe(5);
    expect(book.bySet.get("w2-3")).toEqual(["rounds"]);
    expect(book.bySet.get("w2-4")).toBeUndefined();
  });
});

describe("cardio achievements", () => {
  it("gives badges only for logged kinds, with distance and total progress", () => {
    const achievements = deriveAchievements({
      workouts: [{ sessionId: "s1", endedAt: new Date(2026, 10, 1) }],
      sets: [],
      units: "lb",
      bodyweight: null,
      strengthProfile: null,
      strengthRecords: [],
      cardioSets: [
        {
          sessionId: "s1",
          groupId: "g1",
          completedAt: new Date(2026, 10, 1),
          kind: "run",
          meters: 5030,
          durationSeconds: 1600,
        },
      ],
    });
    const cardio = achievements.filter((a) => a.category === "cardio");
    expect(cardio.some((a) => a.sport === "swim")).toBe(false);
    expect(cardio.find((a) => a.id === "cardio-run-5k")?.achievedAt).not.toBeNull();
    expect(cardio.find((a) => a.id === "cardio-run-10k")?.achievedAt).toBeNull();
    expect(cardio.find((a) => a.id === "cardio-run-total-50mi")?.progress).toEqual({
      current: 3,
      target: 50,
    });
  });
});

describe("timer-style time entry", () => {
  it.each([
    ["", "", null],
    ["5", "0:05", 5],
    ["2605", "26:05", 1565],
    ["10820", "1:08:20", 4100],
    ["0300", "3:00", 180],
  ])("%s reads %s", (digits, text, seconds) => {
    expect(durationDigitsText(digits)).toBe(text);
    expect(durationFromDigits(digits)).toBe(seconds);
  });
});

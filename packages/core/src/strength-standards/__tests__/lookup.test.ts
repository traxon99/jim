import { describe, expect, it } from "vitest";
import { liftStandardThresholds, nextTier, tierForOneRepMax } from "../lookup";

describe("liftStandardThresholds", () => {
  it("scales the bodyweight multiplier table by bodyweight", () => {
    // squat/male/intermediate multiplier is 1.5
    const thresholds = liftStandardThresholds("squat", { sex: "male", bodyweight: 180, age: 25 });
    expect(thresholds.intermediate).toBe(270);
  });

  it("uses the sex-specific table", () => {
    const thresholds = liftStandardThresholds("squat", {
      sex: "female",
      bodyweight: 180,
      age: 25,
    });
    // squat/female/intermediate multiplier is 1.0
    expect(thresholds.intermediate).toBe(180);
  });

  it("applies age adjustment on top of the bodyweight scale", () => {
    const prime = liftStandardThresholds("benchPress", {
      sex: "male",
      bodyweight: 180,
      age: 30,
    });
    const older = liftStandardThresholds("benchPress", {
      sex: "male",
      bodyweight: 180,
      age: 50,
    });
    expect(older.intermediate).toBeCloseTo(prime.intermediate * 0.9, 2);
  });

  it("skips age adjustment when age is omitted", () => {
    const withoutAge = liftStandardThresholds("deadlift", { sex: "male", bodyweight: 200 });
    const primeAge = liftStandardThresholds("deadlift", {
      sex: "male",
      bodyweight: 200,
      age: 25,
    });
    expect(withoutAge).toEqual(primeAge);
  });
});

describe("tierForOneRepMax", () => {
  const profile = { sex: "male" as const, bodyweight: 180, age: 25 };

  it("returns the highest tier cleared", () => {
    // squat/male thresholds at bw 180: beginner 135, novice 180, intermediate 270
    expect(tierForOneRepMax("squat", 200, profile)).toBe("novice");
    expect(tierForOneRepMax("squat", 270, profile)).toBe("intermediate");
  });

  it("returns null when the lift falls short of Beginner", () => {
    expect(tierForOneRepMax("squat", 50, profile)).toBeNull();
  });

  it("returns elite when the lift clears every threshold", () => {
    expect(tierForOneRepMax("squat", 1000, profile)).toBe("elite");
  });
});

describe("nextTier", () => {
  it("steps through the tier order", () => {
    expect(nextTier(null)).toBe("beginner");
    expect(nextTier("beginner")).toBe("novice");
    expect(nextTier("advanced")).toBe("elite");
  });

  it("returns null past elite", () => {
    expect(nextTier("elite")).toBeNull();
  });
});

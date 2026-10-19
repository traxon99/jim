import { describe, expect, it } from "vitest";
import {
  autoEndAt,
  formatIdleMinutes,
  idleReminderAt,
  isValidAutoEndMinutes,
  lastWorkoutActivity,
  shouldAutoEnd,
} from "../workout-idle";

const START = new Date("2026-10-19T17:00:00.000Z");

function minutesAfter(minutes: number): Date {
  return new Date(START.getTime() + minutes * 60_000);
}

describe("lastWorkoutActivity", () => {
  it("is the start until anything else happens", () => {
    expect(lastWorkoutActivity([], START, minutesAfter(5))).toEqual(START);
    expect(lastWorkoutActivity([null, undefined], START, minutesAfter(5))).toEqual(START);
  });

  it("takes the latest set or edit", () => {
    const times = [minutesAfter(3), minutesAfter(12), minutesAfter(8)];
    expect(lastWorkoutActivity(times, START, minutesAfter(20))).toEqual(minutesAfter(12));
  });

  it("caps a timestamp from a clock running ahead at now", () => {
    expect(lastWorkoutActivity([minutesAfter(90)], START, minutesAfter(20))).toEqual(
      minutesAfter(20),
    );
  });
});

describe("idle timing", () => {
  it("reminds 10 minutes after the last activity", () => {
    expect(idleReminderAt(START)).toEqual(minutesAfter(10));
  });

  it("ends after the user's auto-end minutes, never with auto-end off", () => {
    expect(autoEndAt(START, 60)).toEqual(minutesAfter(60));
    expect(autoEndAt(START, null)).toBeNull();
    expect(shouldAutoEnd(START, 60, minutesAfter(59))).toBe(false);
    expect(shouldAutoEnd(START, 60, minutesAfter(60))).toBe(true);
    expect(shouldAutoEnd(START, null, minutesAfter(600))).toBe(false);
  });
});

describe("isValidAutoEndMinutes", () => {
  it("accepts Off and whole minutes from 15 to 12 hours", () => {
    expect(isValidAutoEndMinutes(null)).toBe(true);
    expect(isValidAutoEndMinutes(60)).toBe(true);
    expect(isValidAutoEndMinutes(15)).toBe(true);
    expect(isValidAutoEndMinutes(10)).toBe(false);
    expect(isValidAutoEndMinutes(721)).toBe(false);
    expect(isValidAutoEndMinutes(60.5)).toBe(false);
    expect(isValidAutoEndMinutes("60")).toBe(false);
  });
});

describe("formatIdleMinutes", () => {
  it("uses hours for whole hours", () => {
    expect(formatIdleMinutes(60)).toBe("1 hr");
    expect(formatIdleMinutes(120)).toBe("2 hr");
    expect(formatIdleMinutes(45)).toBe("45 min");
    expect(formatIdleMinutes(90)).toBe("90 min");
  });
});

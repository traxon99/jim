import type { DprDecision } from "@jim/core";
import { describe, expect, it } from "vitest";
import { dprBlockProgress, dprPlainWhy } from "../calls";

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 12));

describe("dprBlockProgress (PRP popover header)", () => {
  const block = { startedAt: day(1), endsAt: day(29), weeks: 4, status: "active" as const };

  it("names the week and counts the days left", () => {
    expect(dprBlockProgress(block, day(16))).toEqual({
      label: "Week 3 of 4",
      daysLeft: 13,
      fraction: 15 / 28,
    });
  });

  it("stays inside the block at both ends", () => {
    expect(dprBlockProgress(block, day(1)).label).toBe("Week 1 of 4");
    expect(dprBlockProgress(block, day(30))).toMatchObject({
      label: "Week 4 of 4",
      daysLeft: 0,
      fraction: 1,
    });
  });

  it("calls the deload week by name", () => {
    expect(dprBlockProgress({ ...block, status: "deload" }, day(25)).label).toBe("Deload week");
  });
});

describe("dprPlainWhy", () => {
  const decision = (call: DprDecision["call"], reason: string): DprDecision => ({
    call,
    reason,
    weight: 195,
    previousWeight: 185,
    targetReps: 8,
    streak: 1,
  });

  it("says an increase went up without repeating the numbers", () => {
    expect(dprPlainWhy(decision("increase", "Hit 1×12 @ 185, RPE 8.5"))).toBe(
      "You cleared the target last time, so the weight goes up.",
    );
  });

  it("keeps the engine's reason on a hold, as one sentence", () => {
    expect(dprPlainWhy(decision("hold", "Hit 3×8 @ RPE 7 — 1/2 to go up"))).toBe(
      "Hit 3×8 @ RPE 7 — 1/2 to go up.",
    );
    expect(dprPlainWhy(decision("hold", "Ends in a period."))).toBe("Ends in a period.");
  });

  it("asks for RPE when the call needs it", () => {
    expect(dprPlainWhy(decision("insufficient", "Add RPE for PRP"))).toMatch(/^Add RPE/);
  });
});

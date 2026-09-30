import { describe, expect, it } from "vitest";
import { EMPTY_PRIOR_BESTS, computePriorBests, detectPersonalRecords } from "../personal-records";

describe("computePriorBests", () => {
  it("is empty for no history", () => {
    expect(computePriorBests([])).toEqual(EMPTY_PRIOR_BESTS);
  });

  it("ignores sets missing weight or reps (time/distance/bodyweight tracking)", () => {
    expect(
      computePriorBests([
        { weight: null, reps: 10 },
        { weight: 100, reps: null },
      ]),
    ).toEqual(EMPTY_PRIOR_BESTS);
  });

  it("tracks the best 1RM, heaviest weight, best single-set volume, and best reps per weight", () => {
    const bests = computePriorBests([
      { weight: 225, reps: 5 }, // ~262.5 estimated 1RM, volume 1125
      { weight: 245, reps: 1 }, // weight PR candidate, volume 245
      { weight: 225, reps: 8 }, // reps-at-225 PR candidate, volume 1800
    ]);

    expect(bests.oneRepMax).toBeGreaterThan(260);
    expect(bests.weight).toBe(245);
    expect(bests.volume).toBe(1800);
    expect(bests.repsAtWeight["225.00"]).toBe(8);
  });
});

describe("detectPersonalRecords", () => {
  it("returns nothing for a set with no weight or reps", () => {
    expect(detectPersonalRecords({ weight: null, reps: 5 }, EMPTY_PRIOR_BESTS)).toEqual([]);
  });

  it("detects every kind on the very first set ever logged", () => {
    const candidates = detectPersonalRecords({ weight: 135, reps: 5 }, EMPTY_PRIOR_BESTS);
    expect(candidates.map((c) => c.kind).sort()).toEqual(
      ["1rm", "reps_at_weight", "volume", "weight"].sort(),
    );
  });

  it("detects only the kinds actually beaten", () => {
    const prior = computePriorBests([{ weight: 225, reps: 5 }]);

    // Same weight, fewer reps: no PR of any kind.
    expect(detectPersonalRecords({ weight: 225, reps: 3 }, prior)).toEqual([]);

    // Same weight, more reps: a reps-at-weight PR, and since volume/1RM
    // both rise with reps at a fixed weight, those too.
    const moreReps = detectPersonalRecords({ weight: 225, reps: 6 }, prior);
    expect(moreReps.map((c) => c.kind).sort()).toEqual(["1rm", "reps_at_weight", "volume"].sort());

    // Heavier weight for the same reps as before: a weight PR (and 1RM,
    // since heavier-for-equal-reps always raises the estimate); it's a new
    // weight never seen before, so no reps-at-weight bucket to compare, and
    // volume (245*5=1225) beats the prior 225*5=1125.
    const heavier = detectPersonalRecords({ weight: 245, reps: 5 }, prior);
    expect(heavier.map((c) => c.kind).sort()).toEqual(
      ["1rm", "reps_at_weight", "volume", "weight"].sort(),
    );
  });

  it("does not re-detect a PR already matched exactly", () => {
    const prior = computePriorBests([{ weight: 225, reps: 5 }]);
    expect(detectPersonalRecords({ weight: 225, reps: 5 }, prior)).toEqual([]);
  });

  it("does not flag a lighter, never-used weight when a heavier set already did as many reps", () => {
    const prior = computePriorBests([
      { weight: 45, reps: 5 },
      { weight: 160, reps: 8 },
    ]);
    // Issue #352: 150×8 after 160×8, and a 55×2 warm-up weight, aren't PRs.
    expect(detectPersonalRecords({ weight: 150, reps: 8 }, prior)).toEqual([]);
    expect(detectPersonalRecords({ weight: 55, reps: 2 }, prior)).toEqual([]);
  });

  it("still flags reps at a lighter weight that beat every heavier set", () => {
    const prior = computePriorBests([{ weight: 160, reps: 8 }]);
    const kinds = detectPersonalRecords({ weight: 150, reps: 12 }, prior).map((c) => c.kind);
    expect(kinds).toContain("reps_at_weight");
  });
});

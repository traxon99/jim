import { MUSCLES } from "@jim/core";
import { describe, expect, it } from "vitest";
import { BODY_MAP_MUSCLES } from "../body-map";
import { BACK_ART, FRONT_ART } from "../body-map-art";

/** Mean x of a path's points, enough to tell which half of the figure it's on. */
function meanX(d: string): number {
  const numbers = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  let sum = 0;
  for (let i = 0; i < numbers.length - 1; i += 2) sum += numbers[i] ?? 0;
  return sum / Math.floor(numbers.length / 2);
}

describe("BodyMap", () => {
  it("has a region for every muscle in the controlled vocabulary", () => {
    // Every seeded exercise's muscles come from MUSCLES, so this is what
    // makes every one of them show up on the map (issue #252).
    expect(MUSCLES.filter((muscle) => !BODY_MAP_MUSCLES.has(muscle))).toEqual([]);
  });

  it("tags each region with the body's own side, not the viewer's", () => {
    // The injury picker records the tapped side (issue #627). On the front
    // the person's left is drawn on the viewer's right; on the back it isn't.
    const wrong = [
      ...FRONT_ART.regions
        .filter((region) => (region.side === "left") !== meanX(region.d) > 512)
        .map((region) => `front ${region.muscle} ${region.side}`),
      ...BACK_ART.regions
        .filter((region) => (region.side === "left") !== meanX(region.d) < 512)
        .map((region) => `back ${region.muscle} ${region.side}`),
    ];
    expect(wrong).toEqual([]);
  });
});

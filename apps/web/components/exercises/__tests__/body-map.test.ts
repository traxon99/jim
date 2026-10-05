import { MUSCLES } from "@jim/core";
import { describe, expect, it } from "vitest";
import { BODY_MAP_MUSCLES } from "../body-map";

describe("BodyMap", () => {
  it("has a region for every muscle in the controlled vocabulary", () => {
    // Every seeded exercise's muscles come from MUSCLES, so this is what
    // makes every one of them show up on the map (issue #252).
    expect(MUSCLES.filter((muscle) => !BODY_MAP_MUSCLES.has(muscle))).toEqual([]);
  });
});

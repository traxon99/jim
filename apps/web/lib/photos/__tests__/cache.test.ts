import { describe, expect, it } from "vitest";
import { planEviction } from "../cache";

describe("planEviction", () => {
  const entries = [
    { key: "/a", bytes: 40, lastUsed: 3 },
    { key: "/b", bytes: 40, lastUsed: 1 },
    { key: "/c", bytes: 40, lastUsed: 2 },
  ];

  it("evicts nothing under the cap", () => {
    expect(planEviction(entries, 120)).toEqual([]);
  });

  it("evicts the least recently used until the rest fit", () => {
    expect(planEviction(entries, 100)).toEqual(["/b"]);
    expect(planEviction(entries, 50)).toEqual(["/b", "/c"]);
    expect(planEviction(entries, 0)).toEqual(["/b", "/c", "/a"]);
  });
});

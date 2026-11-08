import {
  type SessionSetTableSizes,
  parseSetDraftNumber,
  parseSetDraftRpe,
  sessionSetTableSizes,
} from "@/components/workout/session-set-ui";
import { describe, expect, it } from "vitest";

const TABLE_KEYS: (keyof SessionSetTableSizes)[] = [
  "headerRow",
  "headerCell",
  "prevCell",
  "indexCell",
  "cell",
  "actionCell",
];

describe("sessionSetTableSizes (#556)", () => {
  it("includes every class SessionSetTable reads", () => {
    for (const large of [false, true]) {
      const sizes = sessionSetTableSizes(large);
      for (const key of TABLE_KEYS) {
        expect(typeof sizes[key]).toBe("string");
        expect(sizes[key].length).toBeGreaterThan(0);
      }
    }
  });

  it("uses larger title typography in focus view", () => {
    expect(sessionSetTableSizes(true).title).toContain("text-2xl");
    expect(sessionSetTableSizes(false).title).toContain("text-base");
  });
});

describe("parseSetDraftNumber", () => {
  it("treats blank as null", () => {
    expect(parseSetDraftNumber("")).toBeNull();
    expect(parseSetDraftNumber("   ")).toBeNull();
  });

  it("parses finite numbers", () => {
    expect(parseSetDraftNumber("135.5")).toBe(135.5);
  });

  it("rejects non-numeric input", () => {
    expect(parseSetDraftNumber("abc")).toBeNull();
  });
});

describe("parseSetDraftRpe", () => {
  it("clamps RPE to the allowed range", () => {
    expect(parseSetDraftRpe("11")).toBe(10);
    expect(parseSetDraftRpe("6.2")).toBe(6.2);
  });
});

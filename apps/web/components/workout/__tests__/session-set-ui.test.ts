import {
  type SessionSetTableSizes,
  UNLOG_GRACE_MS,
  canUnlogSet,
  parseSetDraftNumber,
  parseSetDraftRpe,
  sessionSetTableSizes,
  unloggedSetDraft,
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

describe("unlogging a set (issue #645)", () => {
  it("ignores a ✓ tap within the grace period after logging", () => {
    const loggedAt = new Date("2026-11-19T10:00:00Z");
    expect(canUnlogSet(loggedAt, new Date(loggedAt.getTime() + 200))).toBe(false);
    expect(canUnlogSet(loggedAt, new Date(loggedAt.getTime() + UNLOG_GRACE_MS))).toBe(true);
  });

  it("puts the logged values back in the row, formatted like a logged set", () => {
    expect(unloggedSetDraft({ weight: "102.50", reps: 8, rpe: "8.0", kind: "failure" })).toEqual({
      weight: "102.5",
      reps: "8",
      rpe: "8",
      kind: "failure",
    });
    expect(unloggedSetDraft({ weight: null, reps: null, rpe: null, kind: "warmup" })).toEqual({
      weight: "",
      reps: "",
      rpe: "",
      kind: "warmup",
    });
  });

  it("brings an old drop set back as a working set", () => {
    expect(unloggedSetDraft({ weight: "50", reps: 10, rpe: null, kind: "drop" }).kind).toBe(
      "working",
    );
  });
});

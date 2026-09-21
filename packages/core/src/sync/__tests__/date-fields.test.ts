import { describe, expect, it } from "vitest";
import { normalizeDates } from "../date-fields";

describe("normalizeDates", () => {
  it("converts an ISO string field to a Date", () => {
    const input: { updatedAt: string | Date } = { updatedAt: "2026-01-01T00:00:00.000Z" };
    const result = normalizeDates(input, ["updatedAt"]);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect((result.updatedAt as Date).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("leaves null and undefined alone", () => {
    const result = normalizeDates({ deletedAt: null, endedAt: undefined }, [
      "deletedAt",
      "endedAt",
    ]);
    expect(result.deletedAt).toBeNull();
    expect(result.endedAt).toBeUndefined();
  });

  it("leaves an already-a-Date value alone", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    const result = normalizeDates({ updatedAt: date }, ["updatedAt"]);
    expect(result.updatedAt).toBe(date);
  });

  it("does not touch fields outside the given keys", () => {
    const result = normalizeDates({ name: "Push Day", updatedAt: "2026-01-01T00:00:00.000Z" }, [
      "updatedAt",
    ]);
    expect(result.name).toBe("Push Day");
  });
});

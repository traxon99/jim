import { describe, expect, it } from "vitest";
import { isNewerWrite } from "../lww";

describe("isNewerWrite", () => {
  it("prefers the later updatedAt", () => {
    const current = { id: "a", updatedAt: new Date("2026-01-01T00:00:00Z"), deviceId: "device-a" };
    const incoming = { id: "a", updatedAt: new Date("2026-01-02T00:00:00Z"), deviceId: "device-a" };
    expect(isNewerWrite(incoming, current)).toBe(true);
    expect(isNewerWrite(current, incoming)).toBe(false);
  });

  it("ties on updatedAt break by the lexicographically greater deviceId", () => {
    const at = new Date("2026-01-01T00:00:00Z");
    const fromA = { id: "a", updatedAt: at, deviceId: "device-a" };
    const fromB = { id: "a", updatedAt: at, deviceId: "device-b" };
    expect(isNewerWrite(fromB, fromA)).toBe(true);
    expect(isNewerWrite(fromA, fromB)).toBe(false);
  });

  it("is false against itself (equal timestamp and device)", () => {
    const at = new Date("2026-01-01T00:00:00Z");
    const row = { id: "a", updatedAt: at, deviceId: "device-a" };
    expect(isNewerWrite(row, { ...row })).toBe(false);
  });
});

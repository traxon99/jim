import { describe, expect, it } from "vitest";
import { describeExpiry, describeLastUsed, expiryLabel, isExpired } from "../format";
import type { AccessTokenEntry } from "../types";

const base: AccessTokenEntry = {
  id: "t",
  name: "Script",
  prefix: "jim_pat_Ab3x",
  createdAt: "2026-09-01T12:00:00.000Z",
  expiresAt: null,
  lastUsedAt: null,
};
const now = new Date("2026-09-30T12:00:00.000Z");

describe("access token formatting", () => {
  it("labels the expiry choices", () => {
    expect(expiryLabel(90)).toBe("90 days");
    expect(expiryLabel(null)).toBe("No expiry");
  });

  it("describes a token that never expires, will expire, or has expired", () => {
    expect(describeExpiry(base, now)).toBe("Never expires");
    expect(isExpired(base, now)).toBe(false);

    const future = { ...base, expiresAt: "2026-10-30T12:00:00.000Z" };
    expect(describeExpiry(future, now)).toMatch(/^Expires /);
    expect(isExpired(future, now)).toBe(false);

    const past = { ...base, expiresAt: "2026-09-29T12:00:00.000Z" };
    expect(describeExpiry(past, now)).toMatch(/^Expired /);
    expect(isExpired(past, now)).toBe(true);
  });

  it("says whether a token has been used", () => {
    expect(describeLastUsed(base)).toBe("Never used");
    expect(describeLastUsed({ ...base, lastUsedAt: "2026-09-29T12:00:00.000Z" })).toMatch(
      /^Last used /,
    );
  });
});

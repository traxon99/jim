import { describe, expect, it } from "vitest";
import { openGymCardCode, sealGymCardCode } from "../seal";

const SECRET = "a-long-enough-test-secret";
const ID = "0190a000-0000-7000-8000-000000000001";

describe("gym card sealing (#878)", () => {
  it("round-trips a code and never stores it in the clear", () => {
    const sealed = sealGymCardCode("00048213", ID, SECRET);
    expect(sealed).toMatch(/^gc1\./);
    expect(sealed).not.toContain("00048213");
    expect(openGymCardCode(sealed, ID, SECRET)).toBe("00048213");
    // A fresh IV each time.
    expect(sealGymCardCode("00048213", ID, SECRET)).not.toBe(sealed);
  });

  it("won't open under another key, for another card, or when tampered with", () => {
    const sealed = sealGymCardCode("NSA:7731-0048", ID, SECRET);
    expect(openGymCardCode(sealed, ID, "another-long-test-secret")).toBeNull();
    expect(openGymCardCode(sealed, "0190a000-0000-7000-8000-000000000002", SECRET)).toBeNull();
    expect(openGymCardCode(`${sealed.slice(0, -2)}AA`, ID, SECRET)).toBeNull();
    expect(openGymCardCode("00048213", ID, SECRET)).toBeNull();
  });
});

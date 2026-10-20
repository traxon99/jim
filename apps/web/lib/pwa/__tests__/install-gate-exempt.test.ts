import { describe, expect, it } from "vitest";
import { isInstallGateExempt } from "../install-gate-exempt";

const ID = "0b5f3c1e-2a4d-4c6b-9e8f-1a2b3c4d5e6f";

describe("isInstallGateExempt", () => {
  it("lets a browser tab read a share link (#638)", () => {
    expect(isInstallGateExempt(`/share/${ID}`, "")).toBe(true);
    expect(isInstallGateExempt(`/share/${ID}`, "from=settings")).toBe(true);
  });

  it("lets Safari show the sign-up confirmation page (#670)", () => {
    expect(isInstallGateExempt("/auth/confirmed", "next=%2F")).toBe(true);
  });

  it("still gates the rest of the app", () => {
    expect(isInstallGateExempt("/routines", "")).toBe(false);
    expect(isInstallGateExempt("/share/not-a-link", "")).toBe(false);
    expect(isInstallGateExempt(`/share/${ID}/other`, "")).toBe(false);
    expect(isInstallGateExempt("/login", `next=/share/${ID}`)).toBe(false);
  });
});

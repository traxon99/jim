import { describe, expect, it } from "vitest";
import { decideAdminAccess } from "../access";

const ID = "11111111-1111-1111-1111-111111111111";

describe("decideAdminAccess", () => {
  it("shuts out anyone signed out", () => {
    expect(decideAdminAccess(null, "admin")).toEqual({ status: "none" });
    expect(decideAdminAccess({}, "admin")).toEqual({ status: "none" });
  });

  it("shuts out users and coaches, even on an aal2 session", () => {
    expect(decideAdminAccess({ sub: ID, aal: "aal2" }, "user")).toEqual({ status: "none" });
    expect(decideAdminAccess({ sub: ID, aal: "aal2" }, "coach")).toEqual({ status: "none" });
    expect(decideAdminAccess({ sub: ID, aal: "aal2" }, undefined)).toEqual({ status: "none" });
  });

  it("sends an admin without TOTP to the TOTP step", () => {
    expect(decideAdminAccess({ sub: ID, email: "a@x.test", aal: "aal1" }, "admin")).toEqual({
      status: "needs-mfa",
      userId: ID,
      email: "a@x.test",
    });
    expect(decideAdminAccess({ sub: ID }, "admin").status).toBe("needs-mfa");
  });

  it("lets an admin on an aal2 session in", () => {
    expect(decideAdminAccess({ sub: ID, email: "a@x.test", aal: "aal2" }, "admin")).toEqual({
      status: "ok",
      userId: ID,
      email: "a@x.test",
    });
  });
});

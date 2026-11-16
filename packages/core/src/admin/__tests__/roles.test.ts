import { describe, expect, it } from "vitest";
import { ACCOUNT_ROLES, isAccountRole, isAdminRole, isAssignableRole } from "../roles";

describe("account roles", () => {
  it("has user, coach and admin", () => {
    expect(ACCOUNT_ROLES).toEqual(["user", "coach", "admin"]);
  });

  it("only lets the admin UI assign user and coach", () => {
    expect(isAssignableRole("user")).toBe(true);
    expect(isAssignableRole("coach")).toBe(true);
    expect(isAssignableRole("admin")).toBe(false);
    expect(isAssignableRole("root")).toBe(false);
  });

  it("recognises roles and admins", () => {
    expect(isAccountRole("coach")).toBe(true);
    expect(isAccountRole(3)).toBe(false);
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("coach")).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});

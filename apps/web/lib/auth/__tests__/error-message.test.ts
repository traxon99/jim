import { describe, expect, it } from "vitest";
import { authErrorMessage, isExpiredSessionError } from "../error-message";

describe("authErrorMessage (#542)", () => {
  it("maps known Supabase codes to plain copy", () => {
    expect(
      authErrorMessage({ code: "invalid_credentials", message: "Invalid login credentials" }),
    ).toBe("Incorrect email or password.");
    expect(
      authErrorMessage({ code: "user_already_exists", message: "User already registered" }),
    ).toMatch(/already exists/);
  });

  it("treats a missing session as an expired reset link", () => {
    const error = { message: "Auth session missing!" };
    expect(isExpiredSessionError(error)).toBe(true);
    expect(authErrorMessage(error)).toMatch(/expired/);
  });

  it("doesn't show an unknown raw message", () => {
    expect(
      authErrorMessage({ code: "unexpected_failure", message: "db timeout 0x1f" }),
    ).not.toMatch(/0x1f/);
  });
});

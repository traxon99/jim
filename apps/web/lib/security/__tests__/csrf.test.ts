import { isCrossOriginMutation } from "@/lib/security/csrf";
import { describe, expect, it } from "vitest";

const base = {
  method: "POST",
  pathname: "/api/sync/push",
  origin: "https://jim.app",
  requestOrigin: "https://jim.app",
};

describe("isCrossOriginMutation", () => {
  it("allows same-origin mutations", () => {
    expect(isCrossOriginMutation(base)).toBe(false);
  });

  it("blocks mutations from another origin", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(isCrossOriginMutation({ ...base, method, origin: "https://evil.example" })).toBe(true);
    }
    expect(isCrossOriginMutation({ ...base, origin: "null" })).toBe(true);
    expect(isCrossOriginMutation({ ...base, origin: "http://jim.app" })).toBe(true);
  });

  it("allows requests with no Origin header", () => {
    expect(isCrossOriginMutation({ ...base, origin: null })).toBe(false);
  });

  it("never blocks safe methods", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(isCrossOriginMutation({ ...base, method, origin: "https://evil.example" })).toBe(
        false,
      );
    }
  });

  it("ignores non-API paths", () => {
    expect(
      isCrossOriginMutation({ ...base, pathname: "/login", origin: "https://evil.example" }),
    ).toBe(false);
  });

  it("exempts the QStash callback", () => {
    expect(
      isCrossOriginMutation({
        ...base,
        pathname: "/api/push/rest-timer/fire",
        origin: "https://qstash.upstash.io",
      }),
    ).toBe(false);
  });
});

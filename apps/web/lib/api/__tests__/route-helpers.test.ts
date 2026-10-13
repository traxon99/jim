import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { describe, expect, it } from "vitest";
import {
  isUuid,
  readJsonBody,
  readJsonObject,
  unauthenticated,
  unauthenticatedOrThrow,
} from "../route-helpers";

function jsonRequest(body: string) {
  return new Request("https://jim.test/api", { method: "POST", body });
}

describe("API route helpers (#553)", () => {
  it("accepts only UUID strings", () => {
    expect(isUuid("0192f5a0-8a3b-7c4d-9e5f-0a1b2c3d4e5f")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(42)).toBe(false);
  });

  it("answers a signed-out caller with 401 and rethrows anything else", async () => {
    expect(unauthenticated().status).toBe(401);
    expect(unauthenticatedOrThrow(new UnauthenticatedError()).status).toBe(401);
    expect(() => unauthenticatedOrThrow(new Error("db down"))).toThrow("db down");
  });

  it("reads an object body, or null for invalid JSON and non-objects", async () => {
    expect(await readJsonObject(jsonRequest('{"a":1}'))).toEqual({ a: 1 });
    expect(await readJsonObject(jsonRequest("[1"))).toBeNull();
    expect(await readJsonObject(jsonRequest("3"))).toBeNull();
  });

  it("tells invalid JSON apart from any JSON value", async () => {
    expect(await readJsonBody(jsonRequest("3"))).toEqual({ ok: true, body: 3 });
    expect(await readJsonBody(jsonRequest("{"))).toEqual({ ok: false });
  });
});

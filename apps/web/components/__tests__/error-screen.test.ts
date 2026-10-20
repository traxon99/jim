import { describe, expect, it } from "vitest";
import { crashReport } from "../error-screen";

describe("crashReport", () => {
  it("names the page, the error and its digest", () => {
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    expect(crashReport(error, "/workout/42")).toBe(
      "Jim crashed and showed the error screen.\n\nPage: /workout/42\nError: boom\nDigest: abc123",
    );
  });

  it("leaves out the digest line when there isn't one", () => {
    expect(crashReport(new Error(""), "/history")).toBe(
      "Jim crashed and showed the error screen.\n\nPage: /history\nError: (no message)",
    );
  });
});

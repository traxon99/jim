import {
  countCommitsViaGit,
  countCommitsViaGitHub,
  formatVersion,
  resolveAppVersion,
} from "@/lib/version/resolve";
import { describe, expect, it, vi } from "vitest";

describe("formatVersion", () => {
  it("uses the commit count as the patch number", () => {
    expect(formatVersion({ major: 1, minor: 0 }, 0)).toBe("1.0.0");
    expect(formatVersion({ major: 2, minor: 3 }, 17)).toBe("2.3.17");
  });

  it("marks the build as dev when the count is unknown", () => {
    expect(formatVersion({ major: 1, minor: 0 }, null)).toBe("1.0.0-dev");
  });
});

function json(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe("countCommitsViaGitHub", () => {
  it("counts commits since the last version.json change", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("/commits?") ? json([{ sha: "base" }]) : json({ ahead_by: 5 }),
    );
    await expect(
      countCommitsViaGitHub({ repo: "o/r", sha: "head", token: "t", fetchImpl }),
    ).resolves.toBe(5);
    expect(fetchImpl.mock.calls[0]?.[0]).toContain("path=apps%2Fweb%2Fversion.json");
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "https://api.github.com/repos/o/r/compare/base...head",
    );
  });

  it("is 0 when the deployed commit is the one that changed version.json", async () => {
    const fetchImpl = vi.fn(async () => json([{ sha: "head" }]));
    await expect(
      countCommitsViaGitHub({ repo: "o/r", sha: "head", token: "t", fetchImpl }),
    ).resolves.toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up on an API error", async () => {
    const fetchImpl = vi.fn(async () => json({ message: "Not Found" }, false));
    await expect(
      countCommitsViaGitHub({ repo: "o/r", sha: "head", token: "t", fetchImpl }),
    ).resolves.toBeNull();
  });
});

describe("countCommitsViaGit", () => {
  function fakeGit(outputs: Record<string, string>) {
    return (args: string[]) => {
      const out = outputs[args[0] ?? ""];
      if (out === undefined) throw new Error(`unexpected git ${args.join(" ")}`);
      return out;
    };
  }

  it("counts commits since the last version.json change", () => {
    expect(
      countCommitsViaGit(fakeGit({ "rev-parse": "false", log: "abc123", "rev-list": "7" })),
    ).toBe(7);
  });

  it("refuses to count in a shallow clone", () => {
    expect(countCommitsViaGit(fakeGit({ "rev-parse": "true" }))).toBeNull();
  });

  it("gives up when git fails", () => {
    expect(
      countCommitsViaGit(() => {
        throw new Error("not a git repository");
      }),
    ).toBeNull();
  });
});

describe("resolveAppVersion", () => {
  it("resolves from this repo's own git history outside Vercel", async () => {
    const version = await resolveAppVersion({
      base: { major: 1, minor: 0 },
      cwd: process.cwd(),
      env: {},
    });
    // CI/cloud checkouts may be shallow, which falls back to -dev.
    expect(version).toMatch(/^1\.0\.(\d+|0-dev)$/);
  });
});

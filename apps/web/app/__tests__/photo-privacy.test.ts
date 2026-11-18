import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { sourceFiles } from "@/lib/test/source-scan";
import { describe, expect, it } from "vitest";

// Progress photos (issue #835) are private to their owner: no friend function,
// post, share snapshot or card, MCP tool or /v1 endpoint may read them. The
// only readers are the owner's sync and export routes and the bucket policies.

const webRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(webRoot, "../..");
const PHOTO_TERMS = /progress_photos|progressPhotos|progress-photos|PROGRESS_PHOTO/;

function hits(files: string[]): string[] {
  return files
    .filter((file) => PHOTO_TERMS.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(repoRoot, file));
}

const SOURCE = [".ts", ".tsx"];

describe("progress photo privacy", () => {
  it("is not exposed by the MCP server or its /v1 API", () => {
    expect(hits(sourceFiles(path.join(repoRoot, "apps/mcp/src"), SOURCE))).toEqual([]);
  });

  it("is not read by friends, posts, shares or share cards", () => {
    const dirs = [
      "lib/friends",
      "lib/sharing",
      "components/friends",
      "components/sharing",
      "app/api/friends",
      "app/api/posts",
      "app/api/shares",
      "app/api/comments",
      "app/api/activity",
      "app/api/profile",
    ];
    const files = dirs.flatMap((dir) => {
      try {
        return sourceFiles(path.join(webRoot, dir), SOURCE);
      } catch {
        return [];
      }
    });
    expect(hits(files)).toEqual([]);
  });

  it("is not part of any database function a friend or share could call", () => {
    const drizzle = path.join(repoRoot, "packages/db/drizzle");
    const migrations = readdirSync(drizzle)
      .filter((name) => /friend|share|post|comment|reaction|activity/.test(name))
      .map((name) => path.join(drizzle, name));
    expect(hits(migrations)).toEqual([]);
  });

  it("has no photo input in the share card model", () => {
    // The share card model has no photo input (issue #838).
    const core = sourceFiles(path.join(repoRoot, "packages/core/src/sharing"), SOURCE);
    expect(hits(core)).toEqual([]);
  });
});

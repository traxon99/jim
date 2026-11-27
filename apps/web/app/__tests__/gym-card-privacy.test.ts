import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { sourceFiles } from "@/lib/test/source-scan";
import { describe, expect, it } from "vitest";

// Gym card codes are door credentials (issue #878, ADR-026). No friend
// function, post, share, admin screen or tool, or /v1 endpoint may read the
// table, and the MCP's own gym card tools name their columns and never `code`.
// The readers are the owner's sync routes (sealed in, opened out) and export.

const webRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(webRoot, "../..");
const CARD_TERMS = /gym_cards|gymCards\b|gym-cards/;
const SOURCE = [".ts", ".tsx"];

function filesIn(root: string, dirs: string[]): string[] {
  return dirs.flatMap((dir) => {
    try {
      return sourceFiles(path.join(root, dir), SOURCE);
    } catch {
      return [];
    }
  });
}

/** A file's source without the MCP tool names, which only name the tools. */
function readSource(file: string): string {
  return readFileSync(file, "utf8").replace(/\b(list_gym_cards|delete_gym_card)\b/g, "");
}

function hits(files: string[]): string[] {
  return files
    .filter((file) => CARD_TERMS.test(readSource(file)))
    .map((file) => path.relative(repoRoot, file));
}

describe("gym card privacy", () => {
  it("is not read by friends, posts, shares or admin", () => {
    const web = filesIn(webRoot, [
      "lib/friends",
      "lib/sharing",
      "lib/admin",
      "lib/telemetry",
      "components/friends",
      "components/sharing",
      "components/share-card",
      "components/admin",
      "app/admin",
      "app/api/friends",
      "app/api/posts",
      "app/api/shares",
      "app/api/comments",
      "app/api/activity",
      "app/api/profile",
      "app/api/admin",
      "app/api/telemetry",
    ]);
    const packages = filesIn(repoRoot, [
      "packages/db/src/admin",
      "packages/core/src/admin",
      "packages/core/src/sharing",
      "apps/mcp/src/api",
      "apps/mcp/src/admin",
    ]);
    expect(hits([...web, ...packages])).toEqual([]);
  });

  it("is only listed by the MCP, never with its code", () => {
    const mcp = hits(sourceFiles(path.join(repoRoot, "apps/mcp/src"), SOURCE)).filter(
      (file) => !file.includes("__tests__"),
    );
    // server.ts only imports the tools by path; it never touches the table.
    expect(mcp.sort()).toEqual(["apps/mcp/src/server.ts", "apps/mcp/src/tools/gym-cards.ts"]);
    const server = readSource(path.join(repoRoot, "apps/mcp/src/server.ts"));
    expect(server).not.toMatch(/gym_cards|gymCards\b/);
    const tool = readFileSync(path.join(repoRoot, "apps/mcp/src/tools/gym-cards.ts"), "utf8");
    expect(tool).not.toMatch(/gymCards\.code\b/);
    expect(tool).not.toMatch(/select\(\)\s*\.from\(gymCards\)/);
  });

  it("is not part of any database function a friend or share could call", () => {
    const drizzle = path.join(repoRoot, "packages/db/drizzle");
    const migrations = readdirSync(drizzle)
      .filter((name) => /friend|share|post|comment|reaction|activity|admin/.test(name))
      .map((name) => path.join(drizzle, name));
    expect(hits(migrations)).toEqual([]);
  });

  it("serves the zxing reader WASM from this origin, matching the pinned package", () => {
    const vendored = readFileSync(path.join(webRoot, "public/vendor/zxing_reader-3.1.8.wasm"));
    const packaged = readFileSync(
      path.join(webRoot, "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm"),
    );
    const pkg = JSON.parse(
      readFileSync(path.join(webRoot, "node_modules/zxing-wasm/package.json"), "utf8"),
    ) as { version: string };
    expect(pkg.version).toBe("3.1.8");
    expect(vendored.equals(packaged)).toBe(true);
  });
});

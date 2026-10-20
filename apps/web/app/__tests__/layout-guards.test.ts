import { readFileSync } from "node:fs";
import path from "node:path";
import { sourceFiles } from "@/lib/test/source-scan";
import { describe, expect, it } from "vitest";

// jsdom can't measure layout, so these lock down the CSS that keeps forms
// inside a 393px screen (docs/PWA.md §3, docs/LESSONS.md).

const webRoot = path.resolve(__dirname, "../..");

describe("layout guards", () => {
  it("resets fieldset min-width so forms can't grow wider than the screen (#458)", () => {
    const css = readFileSync(path.join(webRoot, "app/globals.css"), "utf8");
    expect(css).toMatch(/fieldset\s*\{[^}]*min-width:\s*0/);
  });

  it("never sizes a fieldset to its content, which undoes that reset", () => {
    const offenders = ["app", "components"]
      .flatMap((dir) => sourceFiles(path.join(webRoot, dir)))
      .filter((file) =>
        /<fieldset[^>]*\bmin-w-(min|max|fit|auto)\b/.test(readFileSync(file, "utf8")),
      )
      .map((file) => path.relative(webRoot, file));
    expect(offenders).toEqual([]);
  });
});

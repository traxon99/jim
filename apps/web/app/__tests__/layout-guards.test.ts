import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// jsdom can't measure layout, so these lock down the CSS that keeps forms
// inside a 393px screen (docs/PWA.md §3, docs/LESSONS.md).

const webRoot = path.resolve(__dirname, "../..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

describe("layout guards", () => {
  it("resets fieldset min-width so forms can't grow wider than the screen (#458)", () => {
    const css = readFileSync(path.join(webRoot, "app/globals.css"), "utf8");
    expect(css).toMatch(/fieldset\s*\{[^}]*min-width:\s*0/);
  });

  it("keeps the global touch-action rule in a layer, so `touch-none` can win (#663)", () => {
    const css = readFileSync(path.join(webRoot, "app/globals.css"), "utf8");
    // Strip @layer blocks (one level of nesting), then make sure no
    // touch-action declaration is left outside a layer: unlayered CSS beats
    // every Tailwind utility.
    const unlayered = css.replace(/@layer\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    expect(unlayered).not.toMatch(/touch-action:\s*manipulation/);
    expect(css).toMatch(/touch-action:\s*manipulation/);
  });

  it("never sizes a fieldset to its content, which undoes that reset", () => {
    const offenders = ["app", "components"]
      .flatMap((dir) => tsxFiles(path.join(webRoot, dir)))
      .filter((file) =>
        /<fieldset[^>]*\bmin-w-(min|max|fit|auto)\b/.test(readFileSync(file, "utf8")),
      )
      .map((file) => path.relative(webRoot, file));
    expect(offenders).toEqual([]);
  });
});

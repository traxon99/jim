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

  it("keeps the global touch-action rule in a layer, so `touch-none` can win (#663)", () => {
    const css = readFileSync(path.join(webRoot, "app/globals.css"), "utf8");
    // Strip @layer blocks (one level of nesting), then make sure no
    // touch-action declaration is left outside a layer: unlayered CSS beats
    // every Tailwind utility.
    const unlayered = css.replace(/@layer\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    expect(unlayered).not.toMatch(/touch-action:\s*manipulation/);
    expect(css).toMatch(/touch-action:\s*manipulation/);
  });

  it("pads the side safe areas, so landscape content clears the Dynamic Island (#673)", () => {
    const css = readFileSync(path.join(webRoot, "app/globals.css"), "utf8");
    expect(css).toMatch(/body\s*\{[^}]*padding-left:\s*env\(safe-area-inset-left\)/);
    // Full-screen overlays (fixed, edge to edge, with their own page
    // background) sit outside body's padding, so they pad themselves.
    const offenders = ["app", "components"]
      .flatMap((dir) => sourceFiles(path.join(webRoot, dir)))
      .filter((file) =>
        [...readFileSync(file, "utf8").matchAll(/className="([^"]*)"/g)].some(
          ([, classes = ""]) =>
            /\bfixed inset-0\b/.test(classes) &&
            /\bbg-white\b/.test(classes) &&
            !/\bsafe-x\b/.test(classes),
        ),
      )
      .map((file) => path.relative(webRoot, file));
    expect(offenders).toEqual([]);
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

  it("keeps glass see-through: no border-box background layer under a translucent fill (#717)", () => {
    const css = readFileSync(path.join(webRoot, "app/globals.css"), "utf8");
    // The gradient-border trick (a border-box layer behind a padding-box
    // fill) paints under the whole shape, so a translucent fill turns solid.
    // Draw rims with inset box-shadow or a plain border.
    expect(css).not.toMatch(/background(-clip)?:[^;]*\bborder-box\b/);
  });

  it("keeps the page header's title and buttons sharp: no backdrop-filter behind them (#720)", () => {
    const css = readFileSync(path.join(webRoot, "app/globals.css"), "utf8");
    // The blur belongs over the status bar (.status-bar-scrim); behind the
    // header it made the title and buttons look blurred on the phone.
    const rules = [...css.matchAll(/\.floating-header-backdrop\s*\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, body] of rules) expect(body).not.toMatch(/backdrop-filter/);
    const header = readFileSync(path.join(webRoot, "components/page-header.tsx"), "utf8");
    expect(header).not.toMatch(/backdrop-blur/);
  });
});

import path from "node:path";
import { type OpeningTag, openingTags, readCode, sourceFiles } from "@/lib/test/source-scan";
import { describe, expect, it } from "vitest";

// Checklist rules from docs/LESSONS.md that are a fixed source pattern, so CI
// catches them instead of a reviewer (issue #688). Each failure lists
// file:line; the fix is in the rule the test name cites.

const webRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(webRoot, "../..");

function tagsIn(dirs: string[], names: string[]) {
  return dirs
    .flatMap((dir) => sourceFiles(path.join(webRoot, dir)))
    .flatMap((file) => {
      const source = readCode(file);
      return names.flatMap((name) =>
        openingTags(source, name).map((tag) => ({ file, source, tag })),
      );
    });
}

function where(file: string, tag: OpeningTag) {
  return `${path.relative(repoRoot, file)}:${tag.line}`;
}

/** The phone app's screens; the desktop portal has no tap ripple or long-press menu. */
const PWA_DIRS = ["app/(shell)", "components"];
const isPortal = (file: string) => file.includes(`${path.sep}portal${path.sep}`);

describe("lesson guards", () => {
  it("positions buttons with absolute!, which beats the ripple's position: relative (#356, #493)", () => {
    const offenders = tagsIn(["app", "components"], ["button"])
      .filter(({ tag }) => /(?<![\w-])absolute(?![\w!-])/.test(tag.text))
      .map(({ file, tag }) => where(file, tag));
    expect(offenders).toEqual([]);
  });

  it("gives a link styled as a button data-ripple (#546)", () => {
    // Styled as a button: a rounded shape with a border or a fill.
    const looksLikeButton = (text: string) =>
      /\brounded(-\w+)?\b/.test(text) && /(?<![\w:-])(border|bg-(?!transparent))/.test(text);
    const offenders = tagsIn(PWA_DIRS, ["Link", "a"])
      .filter(({ file }) => !isPortal(file))
      .filter(({ tag }) => looksLikeButton(tag.text) && !/\bdata-ripple\b/.test(tag.text))
      .map(({ file, tag }) => where(file, tag));
    expect(offenders).toEqual([]);
  });

  it("names every <select> for screen readers (#545)", () => {
    // A label can come from aria-label, a <label htmlFor> (needs an id), or a
    // <label> wrapped around the select.
    const insideLabel = (source: string, index: number) => {
      const before = source.slice(0, index);
      const opened = before.match(/<label[\s>]/g)?.length ?? 0;
      const closed = before.match(/<\/label>/g)?.length ?? 0;
      return opened > closed;
    };
    const offenders = tagsIn(["app", "components"], ["select"])
      .filter(
        ({ source, tag }) =>
          !/\b(aria-label|aria-labelledby|id)=/.test(tag.text) && !insideLabel(source, tag.index),
      )
      .map(({ file, tag }) => where(file, tag));
    expect(offenders).toEqual([]);
  });

  it("takes RPE bounds from RPE_MIN/RPE_MAX, never literals (#512)", () => {
    const roots = [
      path.join(webRoot, "app"),
      path.join(webRoot, "components"),
      path.join(webRoot, "lib"),
      path.join(repoRoot, "apps/mcp/src"),
      path.join(repoRoot, "packages/core/src"),
    ];
    const bound = /\.(min|max|gte|lte)\(\s*\d+\s*\)|\b(min|max)=\{?\s*"?\d+/;
    const offenders = roots
      .flatMap((root) => sourceFiles(root, [".ts", ".tsx"]))
      .filter((file) => !file.endsWith(path.join("sessions", "rpe.ts")))
      .flatMap((file) =>
        readCode(file)
          .split("\n")
          .flatMap((line, i) =>
            /rpe/i.test(line) && bound.test(line)
              ? [`${path.relative(repoRoot, file)}:${i + 1}`]
              : [],
          ),
      );
    expect(offenders).toEqual([]);
  });
});

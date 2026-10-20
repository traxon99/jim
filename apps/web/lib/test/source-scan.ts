import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Helpers for guard tests that scan source text for patterns a shipped bug
 * taught us to ban (docs/LESSONS.md). jsdom can't see layout or tap
 * behavior, so a fixed source pattern is the cheapest thing CI can check.
 */

/** Every file under `dir` with one of `extensions`, skipping deps, dotfiles and tests. */
export function sourceFiles(dir: string, extensions: string[] = [".tsx"]): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name.startsWith(".")) {
      return [];
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full, extensions);
    return extensions.some((ext) => entry.name.endsWith(ext)) ? [full] : [];
  });
}

/** File contents with `//` and block comments blanked out, so prose can't trip a scan. */
export function readCode(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

export interface OpeningTag {
  /** The whole opening tag, from `<name` to its closing `>`. */
  text: string;
  /** Offset of the tag in the source. */
  index: number;
  line: number;
}

/**
 * Every JSX opening tag for `name` (e.g. "button", "Link"). Tracks braces and
 * quotes so a `>` inside `{() => …}` or a string doesn't end the tag early.
 */
export function openingTags(source: string, name: string): OpeningTag[] {
  const tags: OpeningTag[] = [];
  const start = new RegExp(`<${name}(?=[\\s>/])`, "g");
  for (let match = start.exec(source); match; match = start.exec(source)) {
    let i = match.index + name.length + 1;
    let depth = 0;
    let quote: string | null = null;
    for (; i < source.length; i++) {
      const char = source[i];
      if (quote) {
        if (char === quote && source[i - 1] !== "\\") quote = null;
      } else if (char === '"' || char === "'" || char === "`") {
        quote = char;
      } else if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
      } else if (char === ">" && depth === 0) {
        break;
      }
    }
    tags.push({
      text: source.slice(match.index, i + 1),
      index: match.index,
      line: source.slice(0, match.index).split("\n").length,
    });
  }
  return tags;
}

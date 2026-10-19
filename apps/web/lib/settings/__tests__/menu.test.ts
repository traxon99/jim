import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SETTINGS_GROUPS } from "../menu";

const APP_DIR = join(__dirname, "../../../app/(shell)");

describe("SETTINGS_GROUPS", () => {
  const screens = SETTINGS_GROUPS.flat();

  it("lists each screen once", () => {
    expect(new Set(screens.map((s) => s.key)).size).toBe(screens.length);
    expect(new Set(screens.map((s) => s.href)).size).toBe(screens.length);
  });

  it("links every row to a page that exists", () => {
    for (const screen of screens) {
      const path = screen.href.split("?")[0];
      expect(existsSync(join(APP_DIR, path, "page.tsx")), screen.href).toBe(true);
    }
  });

  it("has no empty groups", () => {
    for (const group of SETTINGS_GROUPS) expect(group.length).toBeGreaterThan(0);
  });
});

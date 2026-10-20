import { describe, expect, it } from "vitest";
import {
  COLOR_SCHEME_KEY,
  COLOR_SCHEME_SCRIPT,
  prefersDark,
  storeColorScheme,
} from "../color-scheme";

/** Runs the inline <head> script against a stored setting and a system theme. */
function runScript(stored: string | null, systemDark: boolean): boolean {
  const classes = new Set<string>();
  const document = { documentElement: { classList: { add: (name: string) => classes.add(name) } } };
  const window = { matchMedia: () => ({ matches: systemDark }) };
  const localStorage = { getItem: (key: string) => (key === COLOR_SCHEME_KEY ? stored : null) };
  new Function("localStorage", "window", "document", COLOR_SCHEME_SCRIPT)(
    localStorage,
    window,
    document,
  );
  return classes.has("dark");
}

describe("color scheme before first paint (#669)", () => {
  it.each([
    ["dark", false, true],
    ["light", true, false],
    ["system", true, true],
    ["system", false, false],
    [null, true, true],
    [null, false, false],
  ] as const)("stored %s with a dark system %s → dark %s", (stored, systemDark, dark) => {
    expect(prefersDark(stored, systemDark)).toBe(dark);
    expect(runScript(stored, systemDark)).toBe(dark);
  });

  it("follows the system when storage throws", () => {
    const document = { documentElement: { classList: { add: () => {} } } };
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() =>
      new Function("localStorage", "window", "document", COLOR_SCHEME_SCRIPT)(
        throwing,
        { matchMedia: () => ({ matches: false }) },
        document,
      ),
    ).not.toThrow();
  });

  it("stores the setting, and survives blocked storage", () => {
    const values = new Map<string, string>();
    storeColorScheme("dark", { setItem: (key, value) => values.set(key, value) });
    expect(values.get(COLOR_SCHEME_KEY)).toBe("dark");
    expect(() =>
      storeColorScheme("light", {
        setItem: () => {
          throw new Error("blocked");
        },
      }),
    ).not.toThrow();
  });
});

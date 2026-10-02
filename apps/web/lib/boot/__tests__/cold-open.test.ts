import { BOOT_SESSION_KEY, COLD_OPEN_SCRIPT, markBoot } from "@/lib/boot/cold-open";
import { describe, expect, it } from "vitest";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

/** Runs the inline <head> script against a fake sessionStorage and <html>. */
function runScript(storage: ReturnType<typeof memoryStorage>): string | undefined {
  const attributes: Record<string, string> = {};
  const document = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
    },
  };
  new Function("sessionStorage", "document", COLD_OPEN_SCRIPT)(storage, document);
  return attributes["data-boot"];
}

describe("cold open detection", () => {
  it("treats the first load of a session as cold and later ones as warm", () => {
    const storage = memoryStorage();
    expect(markBoot(storage)).toBe("cold");
    expect(storage.getItem(BOOT_SESSION_KEY)).toBe("1");
    expect(markBoot(storage)).toBe("warm");
  });

  it("treats every load as cold when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(markBoot(blocked)).toBe("cold");
    expect(markBoot(null)).toBe("cold");
  });

  it("the inline script marks <html> the same way", () => {
    const storage = memoryStorage();
    expect(runScript(storage)).toBe("cold");
    expect(runScript(storage)).toBe("warm");
  });
});

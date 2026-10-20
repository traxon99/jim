import { describe, expect, it } from "vitest";
import { INSTALL_PROMPT_SCRIPT, takeEarlyInstallPrompt } from "../install-prompt";

describe("early install prompt (#676)", () => {
  it("keeps a prompt fired before hydration for the install gate, once", () => {
    const target = new EventTarget() as EventTarget & Record<string, unknown>;
    new Function("window", INSTALL_PROMPT_SCRIPT)(target);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(takeEarlyInstallPrompt(target)).toBe(event);
    expect(takeEarlyInstallPrompt(target)).toBeNull();
  });

  it("returns nothing when no prompt fired", () => {
    expect(takeEarlyInstallPrompt({})).toBeNull();
  });
});

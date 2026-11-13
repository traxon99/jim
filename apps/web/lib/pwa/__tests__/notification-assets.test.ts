import { readFileSync } from "node:fs";
import path from "node:path";
import manifest from "@/app/manifest";
import { NOTIFICATION_BADGE_URL, NOTIFICATION_ICON_URL } from "@/lib/pwa/notifications";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "../../..");

describe("notification and manifest assets (#681)", () => {
  it("uses the monochrome badge everywhere notifications are shown", () => {
    const pushClient = readFileSync(path.join(webRoot, "lib/pwa/push-client.ts"), "utf8");
    const sw = readFileSync(path.join(webRoot, "public/sw.template.js"), "utf8");
    expect(NOTIFICATION_BADGE_URL).toBe("/icons/badge");
    expect(NOTIFICATION_ICON_URL).toBe("/icons/192");
    expect(pushClient).toContain("NOTIFICATION_BADGE_URL");
    expect(pushClient).not.toMatch(/badge:\s*["']\/icons\/192["']/);
    expect(sw).toMatch(/badge:\s*["']\/icons\/badge["']/);
  });

  it("pins manifest launch colors, id and workout shortcut", () => {
    const m = manifest();
    expect(m.id).toBe("/");
    expect(m.theme_color).toBe("#f2f2f7");
    expect(m.background_color).toBe("#f2f2f7");
    expect(m.shortcuts).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: "/workout", name: "Start workout" })]),
    );
  });
});

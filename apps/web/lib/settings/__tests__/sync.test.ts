import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../db/schema";
import { DEFAULT_SETTINGS } from "../defaults";
import { deviceTimeZone, refreshSettings } from "../sync";

const database = createTestDb(`jim-settings-sync-${crypto.randomUUID()}`);

afterEach(async () => {
  await database.settings.clear();
});

function fakeFetch(timeZone: string | null) {
  const { id: _id, ...settings } = DEFAULT_SETTINGS;
  return vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "PATCH"
      ? new Response("{}")
      : new Response(JSON.stringify({ ...settings, timeZone })),
  );
}

// The phone reports its zone so the MCP server's weeks match the app's (#511).
describe("refreshSettings", () => {
  it("reports the device's time zone when the server doesn't have it", async () => {
    const fetchImpl = fakeFetch(null);
    await refreshSettings(database, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/settings",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ timeZone: deviceTimeZone() }),
      }),
    );
    // The zone isn't a setting the app reads, so it isn't cached.
    expect(await database.settings.get("me")).not.toHaveProperty("timeZone");
  });

  it("leaves the server alone when it already has this zone", async () => {
    const fetchImpl = fakeFetch(deviceTimeZone());
    await refreshSettings(database, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

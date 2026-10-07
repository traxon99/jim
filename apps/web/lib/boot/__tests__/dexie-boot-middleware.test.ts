import { bootQueryMiddleware } from "@/lib/boot/dexie-boot-middleware";
import { isBootReady, subscribeBootReady } from "@/lib/boot/ready";
import { createTestDb } from "@/lib/db/schema";
import { describe, expect, it } from "vitest";

describe("boot query middleware", () => {
  it("holds boot while a query is in flight and releases it after", async () => {
    const database = createTestDb("boot-middleware-test");
    database.use(bootQueryMiddleware);
    await database.open();

    const seen: boolean[] = [];
    const unsubscribe = subscribeBootReady(() => seen.push(isBootReady()));
    await database.settings.get("me");
    unsubscribe();

    expect(seen).toContain(false);
    expect(isBootReady()).toBe(true);
    database.close();
  });
});

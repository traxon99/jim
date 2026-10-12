import { RPE_MAX, RPE_MIN } from "@jim/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { createMcpServer } from "../../server.js";

// Listing tools never touches the database, so this runs without TEST_DATABASE_URL.
describe("log_past_workout input schema (#512)", () => {
  it("limits set RPE to the app's scale, not 1-10", async () => {
    const server = createMcpServer({} as UserContext);
    const client = new Client({ name: "test", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "log_past_workout");
    const schema = tool?.inputSchema as unknown as {
      properties: {
        exercises: {
          items: {
            properties: {
              sets: { items: { properties: { rpe: { minimum: number; maximum: number } } } };
            };
          };
        };
      };
    };
    const rpe = schema.properties.exercises.items.properties.sets.items.properties.rpe;
    expect(rpe.minimum).toBe(RPE_MIN);
    expect(rpe.maximum).toBe(RPE_MAX);

    await client.close();
    await server.close();
  });
});

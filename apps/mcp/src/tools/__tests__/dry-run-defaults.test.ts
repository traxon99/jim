import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { createMcpServer } from "../../server.js";

// Listing tools never touches the database, so this runs without TEST_DATABASE_URL.
describe("dry_run defaults on destructive MCP tools (#539)", () => {
  it("every delete, cancel and merge tool previews by default", async () => {
    const server = createMcpServer({} as UserContext);
    const client = new Client({ name: "test", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    const defaults = (name: string) => {
      const schema = tools.find((tool) => tool.name === name)?.inputSchema as {
        properties?: { dry_run?: { default?: boolean } };
      };
      return schema?.properties?.dry_run?.default;
    };
    for (const name of [
      "merge_exercises",
      "delete_routine",
      "delete_program",
      "delete_workout",
      "delete_gym",
      "cancel_scheduled_workout",
      "delete_body_measurement",
      "delete_injury",
      "clear_injury_exercise_rule",
    ]) {
      expect(defaults(name), name).toBe(true);
    }
    expect(defaults("create_routine")).toBe(false);
    expect(defaults("report_injury")).toBe(false);

    await client.close();
    await server.close();
  });
});

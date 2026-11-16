import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import type { UserContext } from "../../context.js";
import { createMcpServer } from "../../server.js";
import { READ_ONLY_MESSAGE, READ_TOOLS, WRITE_TOOLS } from "../../tool-scopes.js";

async function connect(context: UserContext) {
  const server = createMcpServer(context);
  const client = new Client({ name: "test", version: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

// Listing tools never touches the database, so this runs without TEST_DATABASE_URL.
describe("token scopes on MCP tools (#736)", () => {
  it("classifies every registered tool as exactly one of read or write", async () => {
    const { client, close } = await connect({ isAdmin: true } as UserContext);
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    for (const name of names) {
      expect(READ_TOOLS.has(name) !== WRITE_TOOLS.has(name), name).toBe(true);
    }
    // And the lists don't name tools that no longer exist.
    for (const name of [...READ_TOOLS, ...WRITE_TOOLS]) expect(names, name).toContain(name);
    await close();
  });

  it("lists the admin tools to admins only (#811)", async () => {
    const user = await connect({} as UserContext);
    const names = (await user.client.listTools()).tools.map((tool) => tool.name);
    expect(names.filter((name) => name.startsWith("admin_"))).toEqual([]);
    await user.close();
    const admin = await connect({ isAdmin: true } as UserContext);
    const adminNames = (await admin.client.listTools()).tools.map((tool) => tool.name);
    expect(adminNames).toContain("admin_overview");
    expect(adminNames).toContain("admin_set_sign_in");
    await admin.close();
  });

  it("refuses every write tool to a read token before touching the database", async () => {
    // No db on the context: a handler that reached it would throw a different error.
    const { client, close } = await connect({
      userId: "u",
      email: "",
      scope: "read",
      isAdmin: true,
    } as UserContext);
    for (const args of [
      { sessionId: "s", dry_run: true },
      { sessionId: "s", dry_run: false },
    ]) {
      const result = await client.callTool({ name: "delete_workout", arguments: args });
      expect(result.isError).toBe(true);
      expect((result.content as Array<{ text: string }>)[0]?.text).toBe(READ_ONLY_MESSAGE);
    }
    for (const name of WRITE_TOOLS) {
      const tool = (await client.listTools()).tools.find((t) => t.name === name);
      expect(tool, name).toBeDefined();
    }
    await close();
  });
});

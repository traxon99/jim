import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DrizzleQueryError } from "drizzle-orm";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { recordToolErrors } from "../../telemetry.js";
import { USER_A, resetTestDb, testContext } from "../../test/test-db.js";
import { toolErrorMessage } from "../../tool-error.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("MCP tool error telemetry (#809)", () => {
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = await resetTestDb();
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("records an unexpected failure as the calling user, and not a tool's own message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const server = new McpServer({ name: "test", version: "0" });
    recordToolErrors(server, testContext(USER_A));
    const fail = (error: unknown) => async () => ({
      content: [{ type: "text" as const, text: toolErrorMessage(error) }],
      isError: true,
    });
    server.registerTool(
      "broken_tool",
      { description: "fails" },
      fail(
        new DrizzleQueryError("select * from routines where id = $1", ["x"], new Error("deadlock")),
      ),
    );
    server.registerTool(
      "picky_tool",
      { description: "refuses" },
      fail(new Error("No routine matches x.")),
    );
    const client = new Client({ name: "test", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    await client.callTool({ name: "broken_tool", arguments: {} });
    await client.callTool({ name: "picky_tool", arguments: {} });
    await client.close();
    await server.close();
    log.mockRestore();

    const rows = await admin<{ user_id: string; kind: string; name: string; message: string }[]>`
      SELECT user_id, kind, name, message FROM telemetry_events`;
    expect(rows).toEqual([
      { user_id: USER_A, kind: "mcp_error", name: "broken_tool", message: "deadlock" },
    ]);
  });
});

import { randomUUID } from "node:crypto";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../../db.js";
import { resetTestDb } from "../../test/test-db.js";
import { createClientsStore } from "../clients-store.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("OAuth client registrations (#499)", () => {
  let admin: postgres.Sql;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();
  });

  afterAll(async () => {
    await admin.end();
    await getDb().$client.end();
  });

  it("still knows a registered client after a restart", async () => {
    const client: OAuthClientInformationFull = {
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      client_name: "Claude",
      token_endpoint_auth_method: "none",
    };
    await createClientsStore(getDb).registerClient?.(client);

    // A fresh store has an empty cache, like the process after a deploy.
    const afterRestart = createClientsStore(getDb);
    expect(await afterRestart.getClient(client.client_id)).toEqual(client);
    expect(await afterRestart.getClient(randomUUID())).toBeUndefined();
  });

  it("keeps the table closed to direct reads and writes", async () => {
    const rows = await admin.begin(async (tx) => {
      await tx`SET LOCAL ROLE anon`;
      return tx`SELECT * FROM mcp_oauth_clients`;
    });
    expect(rows).toHaveLength(0);
  });
});

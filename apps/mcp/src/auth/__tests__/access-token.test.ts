import { generateAccessToken, hashAccessToken } from "@jim/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../../db.js";
import { createMcpServer } from "../../server.js";
import { USER_A, USER_B, resetTestDb } from "../../test/test-db.js";
import { resolveAccessToken } from "../access-token.js";
import { SupabaseOAuthProvider } from "../provider.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("personal access tokens (#246)", () => {
  let admin: postgres.Sql;

  async function insertToken(
    userId: string,
    options: { expiresAt?: Date | null; revokedAt?: Date | null } = {},
  ): Promise<string> {
    const token = generateAccessToken();
    await admin`
      INSERT INTO personal_access_tokens (user_id, name, token_hash, token_prefix, expires_at, revoked_at)
      VALUES (${userId}, 'test', ${await hashAccessToken(token)}, ${token.slice(0, 12)},
        ${options.expiresAt?.toISOString() ?? null}, ${options.revokedAt?.toISOString() ?? null})
    `;
    return token;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();
  });

  afterAll(async () => {
    await admin.end();
    await getDb().$client.end();
  });

  it("resolves a live token to its owner and stamps last_used_at", async () => {
    const token = await insertToken(USER_A);
    const resolved = await resolveAccessToken(getDb(), token);
    expect(resolved?.userId).toBe(USER_A);
    const [row] = await admin`
      SELECT last_used_at FROM personal_access_tokens WHERE token_hash = ${await hashAccessToken(token)}
    `;
    expect(row?.last_used_at).not.toBeNull();
  });

  it("rejects unknown, revoked and expired tokens", async () => {
    const revoked = await insertToken(USER_A, { revokedAt: new Date() });
    const expired = await insertToken(USER_A, { expiresAt: new Date(Date.now() - 1000) });
    const future = await insertToken(USER_A, { expiresAt: new Date(Date.now() + 86_400_000) });

    expect(await resolveAccessToken(getDb(), generateAccessToken())).toBeNull();
    expect(await resolveAccessToken(getDb(), revoked)).toBeNull();
    expect(await resolveAccessToken(getDb(), expired)).toBeNull();
    expect((await resolveAccessToken(getDb(), future))?.userId).toBe(USER_A);

    const provider = new SupabaseOAuthProvider();
    await expect(provider.verifyAccessToken(revoked)).rejects.toThrow(/revoked or expired/);
  });

  it("can't read the token table without being its owner", async () => {
    await insertToken(USER_A);
    const asAnon = await admin.begin(async (tx) => {
      await tx`SET LOCAL ROLE anon`;
      return tx`SELECT * FROM personal_access_tokens`;
    });
    expect(asAnon).toHaveLength(0);
    const asB = await admin.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('request.jwt.claim.sub', ${USER_B}, true)`;
      return tx`SELECT * FROM personal_access_tokens`;
    });
    expect(asB).toHaveLength(0);
  });

  it("gives a PAT-only client every tool, scoped to the token's owner", async () => {
    await admin`INSERT INTO routines (user_id, name) VALUES (${USER_A}, 'A routine'), (${USER_B}, 'B routine')`;
    await admin`INSERT INTO sessions (user_id, device_id, started_at, ended_at)
      VALUES (${USER_B}, 'phone', now() - interval '2 hours', now() - interval '1 hour')`;

    const token = await insertToken(USER_A);
    const auth = await new SupabaseOAuthProvider().verifyAccessToken(token);
    expect(auth.extra?.userId).toBe(USER_A);

    const server = createMcpServer({ db: getDb(), userId: USER_A, email: "" });
    const client = new Client({ name: "script", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain("log_past_workout");
    const workouts = await client.callTool({ name: "list_workouts", arguments: {} });
    expect(workouts.isError).toBeFalsy();
    // B's finished workout exists, but A's token can't see it.
    expect(JSON.parse((workouts.content as Array<{ text: string }>)[0]?.text ?? "")).toEqual([]);

    await client.close();
    await server.close();
  });
});

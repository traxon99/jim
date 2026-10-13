import type { Db } from "@jim/db";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { sql } from "drizzle-orm";

/**
 * Dynamically registered OAuth clients (RFC 7591), kept in Postgres so a
 * deploy or restart doesn't forget them (issue #499): the SDK's /token
 * handler looks the client up on every refresh, and an unknown client_id
 * fails with invalid_client, which would sign every connector out after
 * each deploy. Reads and writes run as `anon` through migration 0047's
 * SECURITY DEFINER functions (ADR-006: no service-role key here). A
 * registration never changes, so a hit is cached for the process's life.
 */
export function createClientsStore(getDb: () => Db): OAuthRegisteredClientsStore {
  const cache = new Map<string, OAuthClientInformationFull>();

  return {
    async getClient(clientId) {
      const cached = cache.get(clientId);
      if (cached) return cached;
      const row = await getDb().transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE anon`);
        const [result] = await tx.execute<{ registration: OAuthClientInformationFull | null }>(
          sql`SELECT get_mcp_oauth_client(${clientId}) AS registration`,
        );
        return result;
      });
      if (!row?.registration) return undefined;
      cache.set(clientId, row.registration);
      return row.registration;
    },

    async registerClient(registration) {
      // The SDK's register handler has already assigned client_id.
      const client = registration as OAuthClientInformationFull;
      await getDb().transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE anon`);
        await tx.execute(
          sql`SELECT register_mcp_oauth_client(${client.client_id}, ${JSON.stringify(client)}::jsonb)`,
        );
      });
      cache.set(client.client_id, client);
      return client;
    },
  };
}

import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsTransaction } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(connectionString: string) {
  // `prepare: false` — required against Supabase's Supavisor pooler in
  // transaction mode (port 6543), which is what Vercel's serverless
  // functions should use (direct connections are IPv6-only and don't
  // pool well across short-lived invocations). Harmless against a direct
  // connection too.
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

/** The `tx` param type inside `db.transaction(async (tx) => ...)`. */
export type Tx = PostgresJsTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

/** Either a top-level Db or a transaction — whatever a query-running helper actually needs. */
export type DbOrTx = Db | Tx;

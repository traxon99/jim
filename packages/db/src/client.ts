import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsTransaction } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

/** The `tx` param type inside `db.transaction(async (tx) => ...)`. */
export type Tx = PostgresJsTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

/** Either a top-level Db or a transaction — whatever a query-running helper actually needs. */
export type DbOrTx = Db | Tx;

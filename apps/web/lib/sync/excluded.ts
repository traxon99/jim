import { type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * References a column on Postgres's `excluded` pseudo-table inside an
 * `ON CONFLICT ... DO UPDATE` clause — the incoming row's value for that
 * column. Reads the real (snake_case) column name off the Drizzle column
 * object rather than a hand-typed string, so it can't drift from the schema.
 */
export function excluded(column: PgColumn): SQL {
  return sql.raw(`excluded."${column.name}"`);
}

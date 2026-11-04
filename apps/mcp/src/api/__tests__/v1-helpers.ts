import type { AddressInfo } from "node:net";
import { generateAccessToken, hashAccessToken } from "@jim/core";
import express from "express";
import type postgres from "postgres";
import { getDb } from "../../db.js";
import { v1Router } from "../router.js";

/** Inserts a personal access token for `userId` and returns its plaintext. */
export async function insertToken(
  admin: postgres.Sql,
  userId: string,
  scope: "read" | "read_write" = "read",
): Promise<string> {
  const token = generateAccessToken();
  await admin`
    INSERT INTO personal_access_tokens (user_id, name, token_hash, token_prefix, scope)
    VALUES (${userId}, 'Jackson OS', ${await hashAccessToken(token)}, ${token.slice(0, 12)}, ${scope})
  `;
  return token;
}

/** Serves the /v1 router on a random local port, the way index.ts mounts it. */
export async function startV1() {
  const app = express();
  app.use("/v1", v1Router(getDb));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    get: (path: string, token?: string) =>
      fetch(`${base}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

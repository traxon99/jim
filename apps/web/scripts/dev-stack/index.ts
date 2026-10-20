import { spawn } from "node:child_process";
import path from "node:path";
import { startFakeAuth } from "./fake-auth";
import { startPostgres } from "./postgres";
import { DEV_USER, seedDevDatabase } from "./seed";

/**
 * `pnpm dev:stack`: the real app, signed in as a seeded test user, with no
 * production services (issue #690). Starts a throwaway local Postgres, resets
 * and seeds it, starts the auth stand-in, then runs `next dev` pointed at
 * both. Push, QStash, GitHub feedback and the MCP link stay off because
 * their env vars are unset. `--keep` skips the reset and reseed.
 */

const AUTH_PORT = 54321;
const APP_PORT = Number(process.env.PORT ?? 3000);

const databaseUrl = await startPostgres();
if (!process.argv.includes("--keep")) {
  const seeded = await seedDevDatabase(databaseUrl);
  console.log(`[dev-stack] Seeded ${seeded.exercises} exercises and ${seeded.workouts} workouts.`);
}
const stopAuth = await startFakeAuth(DEV_USER, AUTH_PORT);

const env: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  NODE_ENV: "development",
  NEXT_TELEMETRY_DISABLED: "1",
  PORT: String(APP_PORT),
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${AUTH_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "dev-stack-anon-key",
  DATABASE_URL: databaseUrl,
};
const next = spawn("pnpm", ["exec", "next", "dev", "--port", String(APP_PORT)], {
  cwd: path.resolve(import.meta.dirname, "../.."),
  env,
  stdio: "inherit",
});

console.log(`
[dev-stack] App:      http://localhost:${APP_PORT}
[dev-stack] Sign in:  ${DEV_USER.email} / ${DEV_USER.password}
[dev-stack] Database: ${databaseUrl}
[dev-stack] Screenshot a screen: pnpm dev:shot /workout
`);

const shutdown = async () => {
  next.kill("SIGTERM");
  await stopAuth();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
next.on("exit", async (code) => {
  await stopAuth();
  process.exit(code ?? 0);
});

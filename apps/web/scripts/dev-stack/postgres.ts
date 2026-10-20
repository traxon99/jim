import { execFileSync } from "node:child_process";
import { chownSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";

/**
 * A throwaway Postgres cluster for the dev stack, kept under the OS temp dir
 * and listening on 127.0.0.1 only. DEV_DATABASE_URL overrides it, but must
 * point at localhost: the stack drops and recreates the schemas on every
 * start, so it refuses anything that could hold real data.
 */

const PORT = 54329;
const DATABASE = "jim_dev";
const STACK_DIR = path.join(tmpdir(), "jim-dev-stack");
const DATA_DIR = path.join(STACK_DIR, "pg");

export async function startPostgres(): Promise<string> {
  const override = process.env.DEV_DATABASE_URL;
  if (override) {
    assertLocal(override);
    return override;
  }

  const bin = postgresBinDir();
  const asPostgres = runAsPostgresUser();
  mkdirSync(STACK_DIR, { recursive: true });
  if (asPostgres) chownToPostgres(STACK_DIR);

  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    run(asPostgres, path.join(bin, "initdb"), ["-D", DATA_DIR, "-U", "postgres", "--auth=trust"]);
  }
  if (!isRunning(asPostgres, bin)) {
    run(asPostgres, path.join(bin, "pg_ctl"), [
      "-D",
      DATA_DIR,
      "-l",
      path.join(STACK_DIR, "postgres.log"),
      "-o",
      `-p ${PORT} -k ${STACK_DIR} -c listen_addresses=127.0.0.1`,
      "-w",
      "start",
    ]);
  }

  const admin = postgres(`postgres://postgres@127.0.0.1:${PORT}/postgres`, {
    max: 1,
    onnotice: () => {},
  });
  try {
    const [row] = await admin`select 1 from pg_database where datname = ${DATABASE}`;
    if (!row) await admin.unsafe(`create database ${DATABASE}`);
  } finally {
    await admin.end();
  }
  return `postgres://postgres@127.0.0.1:${PORT}/${DATABASE}`;
}

export function assertLocal(url: string) {
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(
      `The dev stack resets its database, so it only runs against localhost (got ${host}).`,
    );
  }
}

function postgresBinDir(): string {
  const candidates = [process.env.PG_BIN];
  try {
    candidates.push(execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim());
  } catch {
    // No pg_config on PATH; fall through to the usual install locations.
  }
  for (const root of ["/usr/lib/postgresql", "/opt/homebrew/opt", "/usr/local/opt"]) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root).sort().reverse()) {
      candidates.push(path.join(root, entry, "bin"));
    }
  }
  const found = candidates.find(
    (dir) => dir && existsSync(path.join(dir, "initdb")) && existsSync(path.join(dir, "pg_ctl")),
  );
  if (!found) {
    throw new Error(
      "Couldn't find Postgres's initdb and pg_ctl. Install Postgres 16, set PG_BIN to its bin directory, or set DEV_DATABASE_URL to a disposable local database.",
    );
  }
  return found;
}

/** initdb refuses to run as root, so a root container runs the server as `postgres`. */
function runAsPostgresUser(): boolean {
  return process.getuid?.() === 0;
}

function chownToPostgres(dir: string) {
  const uid = Number(execFileSync("id", ["-u", "postgres"], { encoding: "utf8" }).trim());
  const gid = Number(execFileSync("id", ["-g", "postgres"], { encoding: "utf8" }).trim());
  chownSync(dir, uid, gid);
}

function run(asPostgres: boolean, command: string, args: string[], quiet = false) {
  const stdio = quiet ? "ignore" : "inherit";
  if (asPostgres) {
    execFileSync("runuser", ["-u", "postgres", "--", command, ...args], { stdio });
  } else {
    execFileSync(command, args, { stdio });
  }
}

function isRunning(asPostgres: boolean, bin: string): boolean {
  try {
    run(asPostgres, path.join(bin, "pg_ctl"), ["-D", DATA_DIR, "status"], true);
    return true;
  } catch {
    return false;
  }
}

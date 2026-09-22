// prebuild step (see package.json) — applies @jim/db migrations and reseeds
// the global exercise catalog, but only for production builds (or builds
// outside Vercel, e.g. locally). Vercel preview deploys share the production
// database, so letting an unmerged branch's preview migrate it applies
// schema changes before they merge — and if the branch's migration is later
// renumbered (say, after merging main), production has a migration the repo
// no longer describes and the next real deploy fails re-running it.
import { spawnSync } from "node:child_process";

const env = process.env.VERCEL_ENV;
if (env && env !== "production") {
  console.log(`[prebuild] Skipping migrations and seed on a ${env} build.`);
  process.exit(0);
}

for (const script of ["db:migrate", "db:seed"]) {
  const result = spawnSync("pnpm", ["--filter", "@jim/db", "run", script], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// prebuild step (see package.json) — applies @jim/db migrations and reseeds
// the global exercise catalog, but only for Vercel production builds, or a
// build elsewhere that opts in with JIM_MIGRATE_ON_BUILD=1.
//
// Vercel preview deploys share the production database, so letting an
// unmerged branch's preview migrate it applies schema changes before they
// merge — and if the branch's migration is later renumbered (say, after
// merging main), production has a migration the repo no longer describes and
// the next real deploy fails re-running it. A local `pnpm build` used to
// migrate and reseed whatever DATABASE_URL pointed at (issue #533), which
// could be production's, so it now has to ask for it.
import { spawnSync } from "node:child_process";

const env = process.env.VERCEL_ENV;
const optedIn = process.env.JIM_MIGRATE_ON_BUILD === "1";
if (env !== "production" && !optedIn) {
  console.log(
    env
      ? `[prebuild] Skipping migrations and seed on a ${env} build.`
      : "[prebuild] Skipping migrations and seed outside Vercel production. Set JIM_MIGRATE_ON_BUILD=1 to run them.",
  );
  process.exit(0);
}

for (const script of ["db:migrate", "db:seed"]) {
  const result = spawnSync("pnpm", ["--filter", "@jim/db", "run", script], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

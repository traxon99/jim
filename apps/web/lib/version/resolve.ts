// Build-time app version (issue #133). version.json holds the hand-picked
// major/minor numbers; the patch number is how many commits the deployed
// commit is ahead of the last commit that changed version.json. So bumping
// the major (or minor) in version.json resets the patch to 0, and every
// deploy after that counts up on its own — nothing else to edit by hand.
//
// Imported by next.config.ts, which inlines the result as
// NEXT_PUBLIC_APP_VERSION. Runs in Node at build time only.
import { execFileSync } from "node:child_process";

export type VersionBase = { major: number; minor: number };

/** Path of version.json from the repo root — what the GitHub API filters commits by. */
export const VERSION_FILE_REPO_PATH = "apps/web/version.json";

/**
 * `major.minor.patch` once the commit count is known. When it isn't, the
 * patch reads "0-dev" so a fallback build is never mistaken for a real release.
 */
export function formatVersion(base: VersionBase, commitsSinceBase: number | null): string {
  const patch = commitsSinceBase === null ? "0-dev" : String(commitsSinceBase);
  return `${base.major}.${base.minor}.${patch}`;
}

type Fetch = (url: string, init: { headers: Record<string, string> }) => Promise<Response>;

/**
 * Counts commits via the GitHub API: finds the last commit at or before
 * `sha` that touched version.json, then asks how far `sha` is ahead of it.
 * Used on Vercel, whose shallow clone doesn't have the history locally.
 */
export async function countCommitsViaGitHub({
  repo,
  sha,
  token,
  fetchImpl = fetch,
}: {
  repo: string;
  sha: string;
  token: string;
  fetchImpl?: Fetch;
}): Promise<number | null> {
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
  };
  const api = `https://api.github.com/repos/${repo}`;

  const commitsResponse = await fetchImpl(
    `${api}/commits?sha=${sha}&path=${encodeURIComponent(VERSION_FILE_REPO_PATH)}&per_page=1`,
    { headers },
  );
  if (!commitsResponse.ok) return null;
  const commits = (await commitsResponse.json()) as { sha?: string }[];
  const baseSha = commits[0]?.sha;
  if (!baseSha) return null;
  if (baseSha === sha) return 0;

  const compareResponse = await fetchImpl(`${api}/compare/${baseSha}...${sha}`, { headers });
  if (!compareResponse.ok) return null;
  const compare = (await compareResponse.json()) as { ahead_by?: number };
  return typeof compare.ahead_by === "number" ? compare.ahead_by : null;
}

type Git = (args: string[]) => string;

/**
 * Same count from local git history (local builds). Returns null in a
 * shallow clone — there, the oldest fetched commit looks like it added
 * version.json and the count would silently come out too low.
 */
export function countCommitsViaGit(git: Git): number | null {
  try {
    if (git(["rev-parse", "--is-shallow-repository"]) === "true") return null;
    const baseSha = git(["log", "-1", "--format=%H", "--", "version.json"]);
    if (!baseSha) return null;
    const count = Number(git(["rev-list", "--count", `${baseSha}..HEAD`]));
    return Number.isInteger(count) ? count : null;
  } catch {
    return null;
  }
}

function runGit(cwd: string): Git {
  return (args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
}

/**
 * Resolves the full version string for this build. On Vercel it uses the
 * GitHub API (needs GITHUB_VERSION_TOKEN with Contents: read on the repo —
 * see .env.example); anywhere else it reads local git history.
 */
export async function resolveAppVersion({
  base,
  cwd,
  env = process.env,
}: {
  base: VersionBase;
  cwd: string;
  env?: Record<string, string | undefined>;
}): Promise<string> {
  let count: number | null = null;

  const sha = env.VERCEL_GIT_COMMIT_SHA;
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const slug = env.VERCEL_GIT_REPO_SLUG;
  const token = env.GITHUB_VERSION_TOKEN;
  if (sha && owner && slug && token) {
    try {
      count = await countCommitsViaGitHub({ repo: `${owner}/${slug}`, sha, token });
    } catch {
      count = null;
    }
  }
  if (count === null) count = countCommitsViaGit(runGit(cwd));

  const version = formatVersion(base, count);
  if (count === null) {
    console.warn(
      `[version] Couldn't count commits since version.json last changed — building as ${version}.`,
    );
  }
  return version;
}

// postbuild step (see package.json) — turns public/sw.template.js into
// public/sw.js by injecting a precache manifest built from the just-finished
// `.next/static` build output. See sw.template.js for why this exists instead
// of a bundler-plugin-based service worker.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const staticDir = join(root, ".next", "static");
const buildId = readFileSync(join(root, ".next", "BUILD_ID"), "utf8").trim();

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

const staticUrls = walk(staticDir).map(
  (file) => `/_next/static/${relative(staticDir, file).split(sep).join("/")}`,
);

// "/" and "/login" so the shell loads offline whether or not the user is
// currently signed in (proxy.ts redirects "/" to "/login" when signed out).
const precacheUrls = ["/", "/login", "/manifest.webmanifest", ...staticUrls];

const template = readFileSync(join(root, "public", "sw.template.js"), "utf8");
const output = template
  .replaceAll("__BUILD_ID__", buildId)
  .replace("__PRECACHE_URLS__", JSON.stringify(precacheUrls));

writeFileSync(join(root, "public", "sw.js"), output);
console.log(`Generated public/sw.js precaching ${precacheUrls.length} URLs (build ${buildId}).`);

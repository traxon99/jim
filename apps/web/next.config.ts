import type { NextConfig } from "next";
import { resolveAppVersion } from "./lib/version/resolve";
import versionBase from "./version.json";

export default async function config(): Promise<NextConfig> {
  return {
    env: {
      // Shown on Profile and attached to feedback — see lib/version/resolve.ts.
      NEXT_PUBLIC_APP_VERSION: await resolveAppVersion({ base: versionBase, cwd: process.cwd() }),
    },
    experimental: {
      // The (shell) pages are all dynamic (auth check reads cookies), so by
      // default Next re-fetches them from the server on every tab switch.
      // Reusing a recently-visited page for a few seconds removes that
      // round-trip lag when hopping between tabs.
      staleTimes: {
        dynamic: 30,
      },
    },
  };
}

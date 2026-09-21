import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default nextConfig;

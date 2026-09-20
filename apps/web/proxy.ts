import type { NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/proxy";

export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Every path except static assets and the PWA files that must load
     * before/without auth: manifest, icons, splash screens, service worker.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|icons|splash|sw.js).*)",
  ],
};

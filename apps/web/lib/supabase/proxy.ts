import { isCrossOriginMutation } from "@/lib/security/csrf";
import { isPublicSharePath } from "@/lib/sharing/public-share";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { supabaseEnv } from "./env";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/auth/confirm",
  "/auth/confirmed",
  "/auth/auth-code-error",
  // QStash's server-to-server callbacks: no cookie, authenticated by their
  // request signature instead (app/api/push/rest-timer/fire/route.ts).
  "/api/push/rest-timer/fire",
  "/api/push/workout-idle/fire",
];

/**
 * Refreshes the Supabase session cookie on every request and redirects
 * unauthenticated requests away from everything but the sign-in flow.
 * Session Server Components can't write cookies (see lib/supabase/server.ts),
 * so this is the one place a refreshed token actually gets persisted.
 */
export async function updateSession(request: NextRequest) {
  // Cookie-auth API routes must not be drivable from another site (CSRF).
  if (
    isCrossOriginMutation({
      method: request.method,
      pathname: request.nextUrl.pathname,
      origin: request.headers.get("origin"),
      requestOrigin: request.nextUrl.origin,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let response = NextResponse.next({ request });

  const { url, anonKey } = supabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Fail closed: any error (network blip, unreachable Supabase, invalid
  // token) is treated as "no session" rather than letting the request through.
  const claims = await supabase.auth.getClaims().catch((error) => {
    console.error("[proxy] getClaims failed, treating as unauthenticated:", error);
    return null;
  });
  const isPublicPath =
    PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path)) ||
    isPublicSharePath(request.nextUrl.pathname);

  if (!claims?.data?.claims && !isPublicPath) {
    // API callers (the sync engine, fetch clients) need a status they can
    // act on. A redirect to /login would be followed by fetch and come back
    // as a 200 HTML page that fails to parse as JSON (#487).
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (
    claims?.data?.claims &&
    (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup")
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

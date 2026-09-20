import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { supabaseEnv } from "./env";

const PUBLIC_PATHS = ["/login", "/auth/confirm", "/auth/auth-code-error"];

/**
 * Refreshes the Supabase session cookie on every request and redirects
 * unauthenticated requests away from everything but the sign-in flow.
 * Session Server Components can't write cookies (see lib/supabase/server.ts),
 * so this is the one place a refreshed token actually gets persisted.
 */
export async function updateSession(request: NextRequest) {
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
  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!claims?.data?.claims && !isPublicPath) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (claims?.data?.claims && request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

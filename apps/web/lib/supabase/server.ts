import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/**
 * For Server Components, Server Actions and Route Handlers. Create a new one
 * per request — never share an instance across requests.
 *
 * Server Components can't write cookies (Next.js throws), so a session
 * refreshed while rendering one won't persist — that's `proxy.ts`'s job,
 * which runs first on every request and can. Called from a Route Handler or
 * Server Action, this client's own cookie writes do take effect.
 */
export async function createClient() {
  // cookies() first: it's what tells Next's static-generation pass this page
  // is dynamic. Validating env vars first would throw during that pass as a
  // hard prerender error instead, rather than deferring to a request.
  const cookieStore = await cookies();
  const { url, anonKey } = supabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

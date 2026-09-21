/**
 * `NEXT_PUBLIC_*` vars must be referenced as literal `process.env.X` property
 * accesses (not through a dynamic lookup) for Next.js to inline them into the
 * browser bundle at build time.
 *
 * Deliberately NOT the vars Vercel's Supabase marketplace integration
 * creates (`JIM_DB_...`): those are marked Sensitive, and Sensitive vars
 * are invisible to Edge Middleware (proxy.ts runs on Edge and calls this on
 * nearly every request). Set these two as plain, non-sensitive vars in
 * Vercel instead, copied from the Supabase dashboard (Settings → API) —
 * they're meant to be public, so there's no downside to that.
 */
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required (see .env.example)",
    );
  }

  return { url, anonKey };
}

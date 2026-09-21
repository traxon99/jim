/**
 * `NEXT_PUBLIC_*` vars must be referenced as literal `process.env.X` property
 * accesses (not through a dynamic lookup) for Next.js to inline them into the
 * browser bundle at build time.
 *
 * Names come from Vercel's Supabase marketplace integration (the "JIM_DB"
 * storage resource), not the plain `NEXT_PUBLIC_SUPABASE_*` names in
 * .env.example — Vercel keeps the resource name baked into publicly exposed
 * vars even with the integration's env var prefix cleared.
 */
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_JIM_DB_JIMSUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_JIM_DB_JIMSUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_JIM_DB_JIMSUPABASE_URL and NEXT_PUBLIC_JIM_DB_JIMSUPABASE_ANON_KEY are required (see .env.example)",
    );
  }

  return { url, anonKey };
}

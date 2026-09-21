/**
 * `NEXT_PUBLIC_*` vars must be referenced as literal `process.env.X` property
 * accesses (not through a dynamic lookup) for Next.js to inline them into the
 * browser bundle at build time.
 *
 * Set these directly in Vercel's Environment Variables settings (see
 * .env.example) rather than relying on the Supabase marketplace
 * integration's auto-generated names, which are tied to the storage
 * resource's name and change if it's reconfigured or recreated.
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

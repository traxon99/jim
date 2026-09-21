import { type SupabaseClient, createClient } from "@supabase/supabase-js";

/**
 * `SUPABASE_URL`/`SUPABASE_ANON_KEY` for local dev; `JIM_DB_JIMSUPABASE_URL`/
 * `JIM_DB_JIMSUPABASE_ANON_KEY` are what Vercel's Supabase marketplace
 * integration (the "JIM_DB" storage resource) names them in deployed
 * environments — see apps/web/lib/supabase/env.ts and .env.example for the
 * same convention. The anon key is not a secret (RLS is what protects data,
 * per ADR-005/006); it's required here only to call Supabase's own Auth API.
 */
function supabaseEnv() {
  const url = process.env.SUPABASE_URL ?? process.env.JIM_DB_JIMSUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.JIM_DB_JIMSUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required (see apps/mcp/.env.example)");
  }
  return { url, anonKey };
}

let client: SupabaseClient | undefined;

/**
 * A single shared client used only for stateless Auth API calls
 * (`signInWithOtp`, `getClaims`, `refreshSession` with an explicit
 * `refresh_token`) — never for `setSession`/`signOut`, which mutate the
 * client's own in-memory "current session" and would race across
 * concurrently handled requests. `persistSession: false` because this is a
 * server process, not a browser.
 */
export function getSupabase(): SupabaseClient {
  const { url, anonKey } = supabaseEnv();
  client ??= createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

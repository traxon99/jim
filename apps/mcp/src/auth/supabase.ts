import { type SupabaseClient, createClient } from "@supabase/supabase-js";

/**
 * Set directly in the deployment's environment variables (see
 * apps/mcp/.env.example) — see apps/web/lib/supabase/env.ts for the same
 * convention. The anon key is not a secret (RLS is what protects data, per
 * ADR-005/006); it's required here only to call Supabase's own Auth API.
 */
function supabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required (see apps/mcp/.env.example)");
  }
  return { url, anonKey };
}

let client: SupabaseClient | undefined;

/**
 * A single shared client used only for stateless Auth API calls
 * (`getClaims`, `refreshSession` with an explicit `refresh_token`) — never
 * for `signInWithPassword`/`setSession`/`signOut`, which mutate the client's
 * own in-memory "current session" and would race across concurrently handled
 * requests (use `createSignInClient` for those). `persistSession: false`
 * because this is a server process, not a browser.
 */
export function getSupabase(): SupabaseClient {
  const { url, anonKey } = supabaseEnv();
  client ??= createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/**
 * A fresh, throwaway client for one `signInWithPassword` call. Signing in
 * stores the new session on the client itself, so each login gets its own
 * rather than touching the shared one above; only the returned tokens are kept.
 */
export function createSignInClient(): SupabaseClient {
  const { url, anonKey } = supabaseEnv();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

/** For Client Components. Safe to call per-render — reuses one instance. */
export function createClient() {
  const { url, anonKey } = supabaseEnv();
  return createBrowserClient(url, anonKey);
}

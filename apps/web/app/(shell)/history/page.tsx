import { HistoryHome } from "@/components/history/history-home";
import { createClient } from "@/lib/supabase/server";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null; // proxy.ts already redirects unauthenticated requests to /login

  return <HistoryHome />;
}

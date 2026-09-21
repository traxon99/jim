import { PrList } from "@/components/history/pr-list";
import { createClient } from "@/lib/supabase/server";

export default async function PrsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <PrList />;
}

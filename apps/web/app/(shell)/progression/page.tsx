import { ProgressionHome } from "@/components/dpr/progression-home";
import { createClient } from "@/lib/supabase/server";

export default async function ProgressionPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <ProgressionHome userId={userId} />;
}

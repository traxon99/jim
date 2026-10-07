import { BodyweightHome } from "@/components/bodyweight/bodyweight-home";
import { createClient } from "@/lib/supabase/server";

export default async function BodyweightPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <BodyweightHome userId={userId} />;
}

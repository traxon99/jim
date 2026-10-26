import { InjuriesHome } from "@/components/injuries/injuries-home";
import { createClient } from "@/lib/supabase/server";

export default async function InjuriesPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <InjuriesHome userId={userId} />;
}

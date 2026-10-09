import { GymsHome } from "@/components/gyms/gyms-home";
import { createClient } from "@/lib/supabase/server";

export default async function GymsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <GymsHome userId={userId} />;
}

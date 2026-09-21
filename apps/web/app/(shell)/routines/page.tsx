import { RoutinesList } from "@/components/routines/routines-list";
import { createClient } from "@/lib/supabase/server";

export default async function RoutinesPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null; // proxy.ts already redirects unauthenticated requests to /login

  return <RoutinesList userId={userId} />;
}

import { RoutineForm } from "@/components/routines/routine-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewRoutinePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <RoutineForm mode="new" userId={userId} />;
}

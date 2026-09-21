import { RoutineForm } from "@/components/routines/routine-form";
import { createClient } from "@/lib/supabase/server";

export default async function EditRoutinePage(props: PageProps<"/routines/[id]/edit">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <RoutineForm mode="edit" userId={userId} routineId={id} />;
}

import { RoutineDetail } from "@/components/routines/routine-detail";
import { createClient } from "@/lib/supabase/server";

export default async function RoutineDetailPage(props: PageProps<"/routines/[id]">) {
  const { id } = await props.params;
  const { edit } = await props.searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  // ?edit=1 opens the editor, where a new routine lands (issue #565).
  return <RoutineDetail id={id} userId={userId} startEditing={edit === "1"} />;
}

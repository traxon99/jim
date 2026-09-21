import { ExerciseDetail } from "@/components/exercises/exercise-detail";
import { createClient } from "@/lib/supabase/server";

export default async function ExerciseDetailPage(props: PageProps<"/exercises/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <ExerciseDetail id={id} userId={userId} />;
}

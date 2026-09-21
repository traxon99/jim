import { ExerciseForm } from "@/components/exercises/exercise-form";
import { createClient } from "@/lib/supabase/server";

export default async function EditExercisePage(props: PageProps<"/exercises/[id]/edit">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <ExerciseForm mode="edit" userId={userId} exerciseId={id} />;
}

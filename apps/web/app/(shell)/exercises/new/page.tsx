import { ExerciseForm } from "@/components/exercises/exercise-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewExercisePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <ExerciseForm mode="new" userId={userId} />;
}

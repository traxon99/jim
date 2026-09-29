import { RoutineForm } from "@/components/routines/routine-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewRoutinePage(props: PageProps<"/routines/new">) {
  const { kind } = await props.searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  // ?kind=warmup starts the form as a warm-up (the Routines tab's "New
  // warm-up", issue #329).
  return (
    <RoutineForm
      mode="new"
      userId={userId}
      initialKind={kind === "warmup" ? "warmup" : "strength"}
    />
  );
}

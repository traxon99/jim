import { ProgramForm } from "@/components/programs/program-form";
import { createClient } from "@/lib/supabase/server";

export default async function EditProgramPage(props: PageProps<"/routines/programs/[id]/edit">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <ProgramForm mode="edit" userId={userId} programId={id} />;
}

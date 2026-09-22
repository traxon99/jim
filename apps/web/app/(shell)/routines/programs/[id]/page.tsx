import { ProgramDetail } from "@/components/programs/program-detail";
import { createClient } from "@/lib/supabase/server";

export default async function ProgramDetailPage(props: PageProps<"/routines/programs/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <ProgramDetail id={id} userId={userId} />;
}

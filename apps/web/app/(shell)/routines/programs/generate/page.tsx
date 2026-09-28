import { ProgramGenerator } from "@/components/programs/program-generator";
import { createClient } from "@/lib/supabase/server";

export default async function GenerateProgramPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <ProgramGenerator userId={userId} />;
}

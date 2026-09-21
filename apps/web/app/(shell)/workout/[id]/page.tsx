import { ActiveSession } from "@/components/workout/active-session";
import { createClient } from "@/lib/supabase/server";

export default async function ActiveSessionPage(props: PageProps<"/workout/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <ActiveSession id={id} userId={userId} />;
}

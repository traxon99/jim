import { SessionDetail } from "@/components/history/session-detail";
import { createClient } from "@/lib/supabase/server";

export default async function SessionDetailPage(props: PageProps<"/history/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <SessionDetail id={id} />;
}

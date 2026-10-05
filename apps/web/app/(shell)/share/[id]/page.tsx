import { SharedPreview } from "@/components/sharing/shared-preview";
import { createClient } from "@/lib/supabase/server";

export default async function SharePage(props: PageProps<"/share/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <SharedPreview id={id} userId={userId} />;
}

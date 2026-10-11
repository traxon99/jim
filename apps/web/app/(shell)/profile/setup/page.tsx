import { SetupWalkthrough } from "@/components/setup/setup-walkthrough";
import { createClient } from "@/lib/supabase/server";

export default async function SetupPage(props: PageProps<"/profile/setup">) {
  const { from } = await props.searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <SetupWalkthrough userId={userId} from={typeof from === "string" ? from : null} />;
}

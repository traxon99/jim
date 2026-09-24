import { createClient } from "@/lib/supabase/server";
import { SettingsHome } from "./settings-home";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  return <SettingsHome email={data?.claims.email} />;
}

import { MuscleVolume } from "@/components/history/muscle-volume";
import { createClient } from "@/lib/supabase/server";

export default async function VolumePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <MuscleVolume />;
}

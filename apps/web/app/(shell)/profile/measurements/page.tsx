import { MeasurementsHome } from "@/components/bodyweight/measurements-home";
import { createClient } from "@/lib/supabase/server";

export default async function MeasurementsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <MeasurementsHome userId={userId} />;
}

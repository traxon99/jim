import { PhotosHome } from "@/components/photos/photos-home";
import { createClient } from "@/lib/supabase/server";

export default async function PhotosPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (!userId) return null;

  return <PhotosHome userId={userId} />;
}

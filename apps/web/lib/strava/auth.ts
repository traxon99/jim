import { UnauthenticatedError } from "@/lib/db/user-scoped";
import { createClient } from "@/lib/supabase/server";

/** The signed-in user's id, verified through the session's JWT; throws UnauthenticatedError when signed out. */
export async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) throw new UnauthenticatedError();
  return userId;
}

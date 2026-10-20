import { PORTAL_PATH, safeNextPath } from "@/lib/pwa/install-gate-exempt";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next") ?? undefined);

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      // A sign-up confirmation opens in Safari, not the installed app, so
      // say where to go next instead of showing the install gate to someone
      // who already installed Jim (#670). Password resets and the portal
      // carry on to where they were headed.
      if ((type === "signup" || type === "email") && !next.startsWith(PORTAL_PATH)) {
        redirect(`/auth/confirmed?next=${encodeURIComponent(next)}`);
      }
      redirect(next);
    }
  }

  redirect("/auth/auth-code-error");
}

"use client";

import { createClient } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={pending}
      className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-300 px-4 py-3 text-base font-medium text-zinc-950 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
    >
      <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

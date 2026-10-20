"use client";

import {
  clearAuthCookies,
  clearCachedPages,
  clearLocalData,
  flushOutboxBeforeSignOut,
} from "@/lib/auth/sign-out";
import { createClient } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";
import { useState } from "react";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSignOut() {
    setPending(true);
    setFailed(false);
    try {
      await signOut();
    } catch {
      // Nothing is cleared until the end, so the user is still signed in.
      setPending(false);
      setFailed(true);
    }
  }

  async function signOut() {
    const unsynced = await flushOutboxBeforeSignOut();
    if (
      unsynced > 0 &&
      !confirm(
        `${unsynced} change${unsynced === 1 ? " hasn't" : "s haven't"} synced yet and will be lost. Sign out anyway?`,
      )
    ) {
      setPending(false);
      return;
    }

    // If the revoke request fails, supabase-js keeps the session — clear the
    // cookie by hand so /login doesn't bounce straight back into the app.
    const { error } = await createClient()
      .auth.signOut()
      .catch((caught: unknown) => ({ error: caught }));
    if (error) clearAuthCookies();
    await clearLocalData();
    await clearCachedPages().catch(() => {});

    // A full page load, not router.push: the shell's mounted tabs and live
    // queries still hold the old account's state, and the Dexie instance
    // was just deleted out from under them.
    window.location.replace("/login");
  }

  return (
    <>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={pending}
        className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-300 px-4 py-3 text-base font-medium text-zinc-950 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
      >
        <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {failed && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-500">
          Couldn't sign out. Check your connection and try again.
        </p>
      )}
    </>
  );
}

"use client";

import { PASSWORD_HINT, authErrorMessage, isExpiredSessionError } from "@/lib/auth/error-message";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "idle" | "submitting" | "error";

export function ResetPasswordForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [linkExpired, setLinkExpired] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setStatus("error");
      setErrorMessage("Passwords don't match.");
      return;
    }

    setStatus("submitting");

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setStatus("error");
      setErrorMessage(authErrorMessage(error));
      setLinkExpired(isExpiredSessionError(error));
      return;
    }

    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-3">
      <label htmlFor="password" className="sr-only">
        New password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={6}
        placeholder="New password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
      <label htmlFor="confirmPassword" className="sr-only">
        Confirm new password
      </label>
      <input
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={6}
        placeholder="Confirm new password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
      <p className="text-xs text-zinc-500 dark:text-zinc-500">{PASSWORD_HINT}</p>
      <button
        type="submit"
        disabled={status === "submitting"}
        className="rounded-lg bg-accent px-4 py-3 text-base font-medium text-accent-foreground disabled:opacity-50"
      >
        {status === "submitting" ? "Updating…" : "Update password"}
      </button>
      {status === "error" && (
        <p role="alert" className="allow-pwa-select text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}
      {status === "error" && linkExpired && (
        <Link
          href={
            next === "/" ? "/forgot-password" : `/forgot-password?next=${encodeURIComponent(next)}`
          }
          className="flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
        >
          Request a new link
        </Link>
      )}
    </form>
  );
}

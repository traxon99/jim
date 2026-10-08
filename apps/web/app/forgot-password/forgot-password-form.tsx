"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useState } from "react";

type Status = "idle" | "submitting" | "sent" | "error";

export function ForgotPasswordForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");

    const supabase = createClient();
    const redirectUrl = new URL("/auth/confirm", window.location.origin);
    redirectUrl.searchParams.set(
      "next",
      next === "/" ? "/reset-password" : `/reset-password?next=${encodeURIComponent(next)}`,
    );

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl.toString(),
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <p className="max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
        Check <strong>{email}</strong> for a link to reset your password.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-3">
      <label htmlFor="email" className="sr-only">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
      <button
        type="submit"
        disabled={status === "submitting"}
        className="rounded-lg bg-accent px-4 py-3 text-base font-medium text-accent-foreground disabled:opacity-50"
      >
        {status === "submitting" ? "Sending…" : "Send reset link"}
      </button>
      {status === "error" && (
        <p role="alert" className="allow-pwa-select text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        <Link
          href={next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`}
          className="font-medium underline underline-offset-4"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

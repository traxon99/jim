"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "idle" | "submitting" | "error";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    router.replace(next);
    router.refresh();
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
      <label htmlFor="password" className="sr-only">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        placeholder="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
      <button
        type="submit"
        disabled={status === "submitting"}
        className="rounded-lg bg-accent px-4 py-3 text-base font-medium text-accent-foreground disabled:opacity-50"
      >
        {status === "submitting" ? "Signing in…" : "Sign in"}
      </button>
      {status === "error" && (
        <p role="alert" className="allow-pwa-select text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        No account?{" "}
        <Link
          href={`/signup?next=${encodeURIComponent(next)}`}
          className="font-medium underline underline-offset-4"
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}

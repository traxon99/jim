"use client";

import { revealBootNow } from "@/lib/boot/gate";
import { submitFeedback } from "@/lib/feedback/submit";
import { APP_VERSION } from "@/lib/version";
import { useEffect, useState } from "react";

type FeedbackStatus = "idle" | "sending" | "sent" | "error";

const BUTTON =
  "flex h-12 w-full items-center justify-center rounded-xl text-base font-medium disabled:opacity-60";

/** The text "Send feedback" files: what broke, where, and on which build. */
export function crashReport(error: Error & { digest?: string }, path: string): string {
  return [
    "Jim crashed and showed the error screen.",
    "",
    `Page: ${path}`,
    `Error: ${error.message || "(no message)"}`,
    error.digest ? `Digest: ${error.digest}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * What a render error shows instead of Next's bare "Application error" (#664).
 * The installed app has no reload button and pull-to-refresh is off, so this
 * is the only way out short of force-quitting: Reload, a fresh load of the
 * Workout tab, and a one-tap bug report.
 */
export function ErrorScreen({ error }: { error: Error & { digest?: string } }) {
  const [feedback, setFeedback] = useState<FeedbackStatus>("idle");

  useEffect(() => {
    console.error(error);
    revealBootNow();
  }, [error]);

  async function sendFeedback() {
    setFeedback("sending");
    const result = await submitFeedback(crashReport(error, window.location.pathname), "bug");
    setFeedback(result.ok ? "sent" : "error");
  }

  return (
    <div
      role="alert"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 bg-white px-6 text-center text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Your workouts are saved on this phone. Reloading usually fixes it.
        </p>
      </div>

      <p className="allow-pwa-select max-w-full break-words rounded-lg bg-zinc-100 px-3 py-2 font-mono text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        {error.message || "Unknown error"}
        {error.digest ? ` (${error.digest})` : ""} · v{APP_VERSION}
      </p>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`${BUTTON} bg-accent text-accent-foreground`}
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => window.location.assign("/workout")}
          className={`${BUTTON} border border-zinc-300 dark:border-zinc-700`}
        >
          Go to Workout
        </button>
        <button
          type="button"
          onClick={sendFeedback}
          disabled={feedback === "sending" || feedback === "sent"}
          className={`${BUTTON} text-zinc-600 dark:text-zinc-400`}
        >
          {feedback === "sending"
            ? "Sending…"
            : feedback === "sent"
              ? "Sent, thanks"
              : feedback === "error"
                ? "Couldn't send. Try again"
                : "Send feedback"}
        </button>
      </div>
    </div>
  );
}

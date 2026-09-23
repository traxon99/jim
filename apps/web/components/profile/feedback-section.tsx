"use client";

import { type FeedbackType, submitFeedback } from "@/lib/feedback/submit";
import { Send } from "lucide-react";
import { useState } from "react";

type Status = "idle" | "sending" | "sent" | "error";

const FEEDBACK_TYPE_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: "bug", label: "Something's broken" },
  { value: "feature", label: "Feature idea" },
  { value: "question", label: "Question" },
];

export function FeedbackSection() {
  const [message, setMessage] = useState("");
  const [type, setType] = useState<FeedbackType>("bug");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (message.trim().length === 0) return;
    setStatus("sending");
    setError(null);
    const result = await submitFeedback(message.trim(), type);
    if (result.ok) {
      setStatus("sent");
      setMessage("");
    } else {
      setStatus("error");
      setError(result.error);
    }
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-3 text-left">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Feedback
      </h2>

      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Spot a bug or have an idea for Jim? Send it straight to the issue tracker.
      </p>

      <select
        value={type}
        onChange={(event) => setType(event.target.value as FeedbackType)}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      >
        {FEEDBACK_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <textarea
        value={message}
        onChange={(event) => {
          setMessage(event.target.value);
          if (status === "sent" || status === "error") setStatus("idle");
        }}
        placeholder="What's on your mind?"
        rows={4}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />

      {status === "error" && error && (
        <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>
      )}
      {status === "sent" && (
        <p className="allow-pwa-select text-xs text-emerald-600 dark:text-emerald-500">
          Thanks — filed as a GitHub issue.
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={status === "sending" || message.trim().length === 0}
        className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
      >
        <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        {status === "sending" ? "Sending…" : "Send feedback"}
      </button>
    </div>
  );
}

"use client";

import { Link2, Unlink2 } from "lucide-react";

interface Props {
  linked: boolean;
  onToggle: () => void;
}

/**
 * Joins an exercise to the one after it as a superset, or splits them
 * (issue #228). Sits between the two exercises it links.
 */
export function SupersetLinkToggle({ linked, onToggle }: Props) {
  const Icon = linked ? Unlink2 : Link2;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={linked}
      className={`flex min-h-11 items-center gap-1.5 self-start rounded-md px-2 text-xs font-medium ${
        linked ? "text-zinc-500 dark:text-zinc-400" : "text-accent"
      }`}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      {linked ? "Unlink superset" : "Superset with next"}
    </button>
  );
}

/** "A1"-style badge marking an exercise's place in a superset. */
export function SupersetBadge({ label }: { label: string }) {
  return (
    <span className="rounded bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-foreground">
      {label}
    </span>
  );
}

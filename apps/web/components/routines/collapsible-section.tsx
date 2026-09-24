"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

interface Props {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/** Warm-ups and the routines list on the Routines page collapse independently (issue #164) — both grow long as the account accumulates routines. */
export function CollapsibleSection({ title, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="flex flex-col gap-1">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex min-h-8 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
            strokeWidth={2}
            aria-hidden="true"
          />
          {title}
        </button>
      </h2>
      {open && children}
    </section>
  );
}

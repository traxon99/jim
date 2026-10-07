"use client";

import { fetchOwnShareLinks, revokeShareLink, sharePath } from "@/lib/sharing/client";
import type { OwnShareLink } from "@/lib/sharing/types";
import Link from "next/link";
import { useEffect, useState } from "react";

const DATE_FORMAT = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });

/**
 * The routine and program links you've shared (issue #254), each with a
 * Revoke that makes it stop working for everyone. Hidden until there's one.
 */
export function SharedLinksSection() {
  const [links, setLinks] = useState<OwnShareLink[] | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchOwnShareLinks().then((result) => {
      if (!cancelled && result.ok) setLinks(result.value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function revoke(link: OwnShareLink) {
    if (!confirm(`Revoke the link to "${link.name}"? It stops working for everyone.`)) return;
    setRevokingId(link.id);
    setError(null);
    const result = await revokeShareLink(link.id);
    setRevokingId(null);
    if (result.ok) setLinks((current) => current?.filter((other) => other.id !== link.id) ?? null);
    else setError(result.error);
  }

  if (!links || links.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-1 text-left">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Shared links
      </h2>
      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {links.map((link) => (
          <li key={link.id} className="flex min-h-11 items-center justify-between gap-3">
            <Link href={sharePath(link.id)} className="flex min-w-0 flex-col py-1">
              <span className="truncate text-sm font-medium">{link.name}</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-500">
                {link.kind === "program" ? "Program" : "Routine"} ·{" "}
                {DATE_FORMAT.format(new Date(link.createdAt))}
              </span>
            </Link>
            <button
              type="button"
              onClick={() => void revoke(link)}
              disabled={revokingId !== null}
              className="min-h-11 shrink-0 px-2 text-sm font-medium text-red-600 disabled:opacity-50 dark:text-red-500"
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}
    </div>
  );
}

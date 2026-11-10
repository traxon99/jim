"use client";

import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { BarChart3, ChevronRight, LineChart, type LucideIcon, Trophy } from "lucide-react";
import Link from "next/link";
import { TrainingStats } from "./training-stats";

const LINKS: readonly { href: string; label: string; detail: string; Icon: LucideIcon }[] = [
  { href: "/history/prs", label: "PRs", detail: "Your best lifts", Icon: Trophy },
  { href: "/history/volume", label: "Volume", detail: "Sets per muscle by week", Icon: BarChart3 },
  { href: "/portal", label: "Analysis", detail: "Charts and trends", Icon: LineChart },
];

/**
 * History's Insights (#783): the 7/30/90-day stats and the ways into PRs,
 * Volume and Analysis, which used to sit above your workouts.
 */
export function HistoryInsights() {
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title="Insights" back={{ href: "/history", label: "History" }} />
      <div className={PAGE_BODY}>
        <TrainingStats />
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {LINKS.map(({ href, label, detail, Icon }) => (
            <li key={href}>
              <Link href={href} data-ripple className="flex min-h-14 items-center gap-3 py-3">
                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-base font-medium">{label}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-500">{detail}</span>
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-zinc-500"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

import type { SettingsScreen } from "@/lib/settings/menu";
import { SETTINGS_GROUPS } from "@/lib/settings/menu";
import {
  Bell,
  ChevronRight,
  Dumbbell,
  type LucideIcon,
  MapPin,
  MessageSquare,
  Palette,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";

const ICONS: Record<SettingsScreen["key"], LucideIcon> = {
  account: UserRound,
  social: Users,
  workout: Dumbbell,
  gyms: MapPin,
  advanced: SlidersHorizontal,
  appearance: Palette,
  notifications: Bell,
  setup: Sparkles,
  feedback: MessageSquare,
};

/** Settings home (issue #650): one row per sub screen, in small groups. */
export function SettingsMenu() {
  return (
    <nav aria-label="Settings" className="flex w-full flex-col gap-4">
      {SETTINGS_GROUPS.map((group) => (
        <ul
          key={group[0].key}
          className="flex w-full flex-col divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-300 dark:divide-zinc-800 dark:border-zinc-700"
        >
          {group.map((screen) => {
            const Icon = ICONS[screen.key];
            return (
              <li key={screen.key}>
                <Link
                  href={screen.href}
                  data-ripple
                  className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm font-medium"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Icon
                      className="h-5 w-5 shrink-0 text-accent"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <span className="flex min-w-0 flex-col">
                      {screen.title}
                      <span className="text-xs font-normal text-zinc-500 dark:text-zinc-500">
                        {screen.hint}
                      </span>
                    </span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-zinc-400"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      ))}
    </nav>
  );
}

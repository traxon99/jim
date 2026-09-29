import { CircleUserRound } from "lucide-react";
import Link from "next/link";
import { FriendsPanel } from "./friends-panel";

/**
 * The Home tab. It took over the Profile tab's slot in the bottom bar and
 * holds the social features — friends and their workouts (issue #35);
 * Profile is one tap away from the button pinned to the top-right corner of
 * the header. The header has no solid bar: the title and the Profile pill
 * float over the feed, which blurs as it scrolls under them (issue #311).
 */
export function HomeScreen() {
  return (
    <main className="flex flex-1 flex-col items-center text-center">
      <header className="sticky top-[env(safe-area-inset-top)] z-10 isolate flex w-full justify-center px-4 pt-3 pb-3">
        <div aria-hidden="true" className="floating-header-backdrop" />
        <div className="flex w-full items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Home</h1>
          <Link
            href="/profile"
            aria-label="Profile"
            data-ripple
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-zinc-900/10 bg-white/60 px-2.5 text-zinc-800 backdrop-blur-md dark:border-white/15 dark:bg-zinc-900/60 dark:text-zinc-100"
          >
            <CircleUserRound className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
      </header>
      <FriendsPanel />
    </main>
  );
}

import { CircleUserRound } from "lucide-react";
import Link from "next/link";
import { FriendsPanel } from "./friends-panel";

/**
 * The Home tab. It took over the Profile tab's slot in the bottom bar and
 * holds the social features — friends and their workouts (issue #35);
 * Profile is one tap away from the button pinned to the top-right corner of
 * the header.
 */
export function HomeScreen() {
  return (
    <main className="flex flex-1 flex-col items-center text-center">
      <header className="flex w-full justify-center px-4 pt-4 pb-3">
        <div className="flex w-full items-center justify-between">
          <h1 className="text-xl font-semibold">Home</h1>
          <Link
            href="/profile"
            aria-label="Profile"
            data-ripple
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-zinc-700 dark:text-zinc-300"
          >
            <CircleUserRound className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
      </header>
      <FriendsPanel />
    </main>
  );
}

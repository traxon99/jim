import { CircleUserRound, UsersRound } from "lucide-react";
import Link from "next/link";

/**
 * The Home tab. It took over the Profile tab's slot in the bottom bar and
 * is where social features will land; Profile is one tap away from the
 * button pinned to the top-right corner of the header.
 */
export function HomeScreen() {
  return (
    <main className="flex flex-1 flex-col items-center text-center">
      <header className="sticky top-0 z-10 flex w-full justify-center bg-white px-6 pt-6 pb-3 dark:bg-zinc-950">
        <div className="flex w-full max-w-xs items-center justify-between">
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
      <section className="flex w-full max-w-xs flex-col items-center gap-2 px-6 py-10">
        <UsersRound
          className="h-8 w-8 text-zinc-400 dark:text-zinc-600"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <h2 className="text-base font-semibold">Friends are coming soon</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Your friends&apos; workouts and activity will show up here.
        </p>
      </section>
    </main>
  );
}

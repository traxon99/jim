import { FLOATING_BUTTON, PageHeader } from "@/components/page-header";
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
      <PageHeader
        title="Home"
        actions={
          <Link href="/profile" aria-label="Profile" data-ripple className={FLOATING_BUTTON}>
            <CircleUserRound className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        }
      />
      <FriendsPanel />
    </main>
  );
}

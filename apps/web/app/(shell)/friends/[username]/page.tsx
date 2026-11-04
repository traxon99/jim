import { Avatar } from "@/components/friends/avatar";
import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { normalizeUsername } from "@jim/core";
import Link from "next/link";
import { notFound } from "next/navigation";

/** Placeholder until friend profiles land (#751); links from Home week rings won't 404. */
export default async function FriendUsernamePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: raw } = await params;
  const username = normalizeUsername(raw);
  if (username === "") notFound();

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title="Friend" back={{ href: "/friends", label: "Friends" }} />
      <div className={`${PAGE_BODY} flex flex-col items-center gap-4 pt-8 text-center`}>
        <Avatar username={username} avatar={null} className="h-20 w-20 text-3xl" />
        <div className="flex flex-col gap-1">
          <p className="allow-pwa-select text-lg font-semibold">@{username}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Their full profile is on the way. For now, find them on your{" "}
            <Link
              href="/friends"
              className="font-medium text-accent underline-offset-2 hover:underline"
            >
              Friends
            </Link>{" "}
            list.
          </p>
        </div>
      </div>
    </main>
  );
}

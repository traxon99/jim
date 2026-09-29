"use client";

import { PAGE_BODY, PageHeader } from "@/components/page-header";
import {
  friendRequestMessage,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
} from "@/lib/friends/client";
import { useFriends } from "@/lib/friends/use-friends";
import { normalizeUsername } from "@jim/core";
import { Check, Search, UserPlus, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

const SECTION_HEADING =
  "text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500";

/**
 * Finding and managing friends (issue #35), moved off Home so Home can open
 * on your own training: look someone up by their exact username, answer
 * requests, and see who you're already friends with. Opened from the
 * Friends button in Home's header, which badges pending requests.
 */
export function FriendsScreen() {
  const { load, refresh } = useFriends();
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function act(userId: string, run: () => Promise<{ ok: boolean; error?: string }>) {
    setBusyUserId(userId);
    setActionError(null);
    const result = await run();
    if (!result.ok) setActionError(result.error ?? "Something went wrong");
    await refresh();
    setBusyUserId(null);
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title="Friends" back={{ href: "/home", label: "Home" }} />
      <div className={PAGE_BODY}>
        <AddFriendForm onSent={refresh} />

        {load.status === "ready" && load.username && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Friends can add you as{" "}
            <span className="allow-pwa-select font-medium text-zinc-950 dark:text-zinc-50">
              @{load.username}
            </span>
            .{" "}
            <Link href="/profile" data-ripple className="underline underline-offset-2">
              Change
            </Link>
          </p>
        )}

        {actionError && (
          <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{actionError}</p>
        )}

        {load.status === "loading" && (
          <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-500">
            Loading friends…
          </p>
        )}

        {load.status === "error" && (
          <section className="flex flex-col items-center gap-3 py-6">
            <p className="allow-pwa-select text-sm text-zinc-600 dark:text-zinc-400">
              {load.error}
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
            >
              Try again
            </button>
          </section>
        )}

        {load.status === "ready" && (
          <FriendLists
            friends={load.friends}
            busyUserId={busyUserId}
            onAccept={(userId) => void act(userId, () => respondToFriendRequest(userId, true))}
            onDecline={(userId) => void act(userId, () => respondToFriendRequest(userId, false))}
            onRemove={(userId) => void act(userId, () => removeFriend(userId))}
          />
        )}
      </div>
    </main>
  );
}

function FriendLists({
  friends,
  busyUserId,
  onAccept,
  onDecline,
  onRemove,
}: {
  friends: Extract<ReturnType<typeof useFriends>["load"], { status: "ready" }>["friends"];
  busyUserId: string | null;
  onAccept: (userId: string) => void;
  onDecline: (userId: string) => void;
  onRemove: (userId: string) => void;
}) {
  const incoming = friends.filter((f) => f.direction === "incoming");
  const outgoing = friends.filter((f) => f.direction === "outgoing");
  const accepted = friends.filter((f) => f.status === "accepted");

  return (
    <div className="route-fade flex flex-col gap-5">
      {incoming.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={SECTION_HEADING}>Friend requests</h2>
          {incoming.map((friend) => (
            <PersonRow key={friend.userId} username={friend.username}>
              <button
                type="button"
                aria-label={`Accept @${friend.username}`}
                disabled={busyUserId === friend.userId}
                onClick={() => onAccept(friend.userId)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-accent text-accent-foreground disabled:opacity-50"
              >
                <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Decline @${friend.username}`}
                disabled={busyUserId === friend.userId}
                onClick={() => onDecline(friend.userId)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-zinc-300 disabled:opacity-50 dark:border-zinc-700"
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </PersonRow>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className={SECTION_HEADING}>
          {accepted.length > 0 ? `Your friends · ${accepted.length}` : "Your friends"}
        </h2>
        {accepted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <UsersRound
              className="h-8 w-8 text-zinc-400 dark:text-zinc-600"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Look someone up by their username to follow their workouts on Home.
            </p>
          </div>
        ) : (
          accepted.map((friend) => (
            <PersonRow key={friend.userId} username={friend.username}>
              <button
                type="button"
                disabled={busyUserId === friend.userId}
                onClick={() => {
                  if (!window.confirm(`Remove @${friend.username} from your friends?`)) return;
                  onRemove(friend.userId);
                }}
                className="min-h-11 rounded-lg px-3 text-sm text-zinc-500 disabled:opacity-50 dark:text-zinc-500"
              >
                Remove
              </button>
            </PersonRow>
          ))
        )}
      </section>

      {outgoing.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={SECTION_HEADING}>Sent requests</h2>
          {outgoing.map((friend) => (
            <PersonRow key={friend.userId} username={friend.username} note="Request sent">
              <button
                type="button"
                disabled={busyUserId === friend.userId}
                onClick={() => onRemove(friend.userId)}
                className="min-h-11 rounded-lg px-3 text-sm text-zinc-500 disabled:opacity-50 dark:text-zinc-500"
              >
                Cancel
              </button>
            </PersonRow>
          ))}
        </section>
      )}
    </div>
  );
}

function AddFriendForm({ onSent }: { onSent: () => Promise<void> }) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const username = normalizeUsername(value);
    if (username === "") return;
    setSending(true);
    setMessage(null);
    const result = await sendFriendRequest(username);
    if (result.ok) {
      const sent = result.value === "sent" || result.value === "accepted";
      setMessage({ text: friendRequestMessage(result.value, username), error: !sent });
      if (sent) {
        setValue("");
        await onSent();
      }
    } else {
      setMessage({ text: result.error, error: true });
    }
    setSending(false);
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-2">
      <label htmlFor="add-friend" className="sr-only">
        Add a friend by username
      </label>
      <div className="flex items-center gap-2 rounded-full bg-zinc-100 py-1 pl-4 pr-1 dark:bg-zinc-900">
        <Search
          className="h-5 w-5 shrink-0 text-zinc-400 dark:text-zinc-500"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <input
          id="add-friend"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setMessage(null);
          }}
          placeholder="Find by exact username"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="send"
          className="min-w-0 flex-1 bg-transparent py-2 text-base text-zinc-950 outline-none placeholder:text-zinc-400 dark:text-zinc-50 dark:placeholder:text-zinc-500"
        />
        <button
          type="submit"
          aria-label="Send friend request"
          disabled={sending || normalizeUsername(value) === ""}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-accent text-accent-foreground disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {message && (
        <p
          className={`allow-pwa-select px-4 text-xs ${
            message.error
              ? "text-red-600 dark:text-red-500"
              : "text-emerald-600 dark:text-emerald-500"
          }`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}

function PersonRow({
  username,
  note,
  children,
}: {
  username: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-200 py-1 pl-2 pr-1 dark:border-zinc-800">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold uppercase text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
      >
        {username.charAt(0)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="allow-pwa-select truncate text-sm font-medium">@{username}</span>
        {note && <span className="text-xs text-zinc-500 dark:text-zinc-500">{note}</span>}
      </div>
      {children}
    </div>
  );
}

"use client";

import { POST_KIND_ICONS } from "@/components/friends/post-kind-icons";
import { deletePost, fetchOwnPosts } from "@/lib/friends/client";
import type { OwnPost } from "@/lib/friends/types";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/**
 * What you've posted to friends (issue #316), newest first, each with a way
 * to take it down. Server data: hidden offline and until there's a post.
 */
export function YourPostsSection() {
  const [posts, setPosts] = useState<OwnPost[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await fetchOwnPosts();
    if (result.ok) setPosts(result.value);
  }, []);

  useEffect(() => {
    void refresh();
    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  async function remove(post: OwnPost) {
    if (!window.confirm(`Delete your post "${post.title}"? Friends will stop seeing it.`)) return;
    setBusyId(post.postId);
    setError(null);
    const result = await deletePost(post.postId);
    if (result.ok) setPosts((current) => current?.filter((p) => p.postId !== post.postId) ?? null);
    else setError(result.error);
    setBusyId(null);
  }

  if (!posts || posts.length === 0) return null;

  return (
    <section className="flex w-full flex-col gap-2 text-left">
      <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-500">Your posts</h2>
      {error && <p className="allow-pwa-select text-xs text-red-600 dark:text-red-500">{error}</p>}
      <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-300 dark:divide-zinc-800 dark:border-zinc-700">
        {posts.map((post) => {
          const Icon = POST_KIND_ICONS[post.kind];
          return (
            <li key={post.postId} className="flex items-start gap-3 py-2 pl-3 pr-1">
              <Icon
                className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <div className="allow-pwa-select flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{post.title}</span>
                {post.detail && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-500">{post.detail}</span>
                )}
                {post.caption && (
                  <span className="whitespace-pre-line break-words text-xs text-zinc-700 dark:text-zinc-300">
                    {post.caption}
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={busyId === post.postId}
                onClick={() => void remove(post)}
                aria-label="Delete post"
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-zinc-500 disabled:opacity-50 dark:text-zinc-500"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

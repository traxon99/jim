"use client";

import { FloatingCard } from "@/components/floating-card";
import { ComposePostCard } from "@/components/friends/post-to-friends-button";
import { FLOATING_BUTTON } from "@/components/page-header";
import { db } from "@/lib/db/schema";
import { type RecentWorkoutDraft, recentWorkoutDrafts } from "@/lib/friends/recent-workout-drafts";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Plus } from "lucide-react";
import { useId, useState } from "react";

/**
 * Home's + (issue #747): pick one of your latest workouts, then write a
 * caption and post it to your friends' feeds.
 */
export function NewPostButton() {
  const [step, setStep] = useState<"closed" | "pick" | RecentWorkoutDraft>("closed");

  return (
    <>
      <button
        type="button"
        aria-label="New post"
        onClick={() => setStep("pick")}
        className={FLOATING_BUTTON}
      >
        <Plus className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
      </button>
      {step === "pick" && (
        <PickWorkoutCard onClose={() => setStep("closed")} onPick={(picked) => setStep(picked)} />
      )}
      {typeof step === "object" && (
        <ComposePostCard
          draft={step.draft}
          onClose={() => setStep("closed")}
          onPosted={() => undefined}
        />
      )}
    </>
  );
}

function PickWorkoutCard({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (picked: RecentWorkoutDraft) => void;
}) {
  const titleId = useId();
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const drafts = useLiveQuery(() => recentWorkoutDrafts(settings.units), [settings.units]);

  return (
    <FloatingCard labelledBy={titleId} onClose={onClose}>
      {(close) => (
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4 text-left">
          <h2 id={titleId} className="text-base font-semibold">
            Post a workout
          </h2>
          {drafts === undefined ? null : drafts.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Finish a workout and it shows up here to post.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
              {drafts.map((picked) => (
                <li key={picked.sessionId}>
                  <button
                    type="button"
                    // One pick per opening (LESSONS #550): the card closes on the first tap.
                    onClick={() => {
                      onPick(picked);
                    }}
                    className="flex min-h-11 w-full items-center gap-3 py-2 text-left"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{picked.draft.title}</span>
                      <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {picked.startedAt.toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                        {picked.draft.detail && ` · ${picked.draft.detail}`}
                      </span>
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-zinc-400"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={close}
              className="min-h-11 rounded-lg px-4 text-sm font-medium text-zinc-600 dark:text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </FloatingCard>
  );
}

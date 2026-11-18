"use client";

import { Share } from "@/components/icons/solar";
import { ShareImageButton } from "@/components/share-card/share-image-button";
import { type CardExtras, achievementCardInput } from "@/lib/share-card/build";
import type { Achievement } from "@jim/core";
import { type ReactNode, useCallback } from "react";

/** Share image for an earned achievement (issue #838): an icon button that opens the card preview. */
export function AchievementShareButton({
  achievement,
  className,
  children,
}: {
  achievement: Achievement;
  className?: string;
  /** Replaces the share icon, so a badge and its title can be the button. */
  children?: ReactNode;
}) {
  const { title, description, category, achievedAt, sessionId } = achievement;
  const build = useCallback(
    (extras: CardExtras) => ({
      kind: "achievement" as const,
      input: achievementCardInput({ title, description, category, achievedAt }, extras),
    }),
    [title, description, category, achievedAt],
  );
  // An achievement not earned yet has no card to share.
  if (!achievedAt) return null;
  return (
    <ShareImageButton
      build={build}
      title={title}
      text={`${title}: ${description}`}
      sessionId={sessionId}
      on={achievedAt}
      label={`Share ${title} as an image`}
      className={className}
    >
      {children ?? <Share className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
    </ShareImageButton>
  );
}

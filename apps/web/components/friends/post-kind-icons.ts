import type { PostKind } from "@jim/core";
import { Award, Dumbbell, type LucideIcon, Trophy } from "lucide-react";

/** The icon each kind of post (issue #316) is shown with. */
export const POST_KIND_ICONS: Record<PostKind, LucideIcon> = {
  workout: Dumbbell,
  record: Trophy,
  achievement: Award,
};

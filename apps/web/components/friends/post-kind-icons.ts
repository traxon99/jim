import { Award, Dumbbell, type IconComponent, Trophy } from "@/components/icons/solar";
import type { PostKind } from "@jim/core";

/** The icon each kind of post (issue #316) is shown with. */
export const POST_KIND_ICONS: Record<PostKind, IconComponent> = {
  workout: Dumbbell,
  record: Trophy,
  achievement: Award,
};

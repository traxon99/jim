-- ❤️ heart, the double-tap reaction. First in the enum, like it's first in
-- @jim/core's REACTION_KINDS, since reaction lists sort by enum order.
-- Hand-authored: drizzle-kit's snapshots lag the hand-written 0066–0069.
ALTER TYPE "public"."reaction_kind" ADD VALUE IF NOT EXISTS 'heart' BEFORE 'strong';

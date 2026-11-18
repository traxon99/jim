import {
  bioError,
  displayNameError,
  isValidAvatar,
  normalizeBio,
  normalizeDisplayName,
} from "@jim/core";

// Shared by PATCH /api/profile and the admin console (issue #807), so an
// admin's edit is held to the same rules as the user's own.

export type ProfilePatch = Partial<{
  avatar: string | null;
  displayName: string | null;
  bio: string | null;
  shareWorkouts: boolean;
  shareWorkoutDetails: boolean;
  discoverableByFriendsOfFriends: boolean;
  shareLeaderboards: boolean;
  shareRelativeStrength: boolean;
}>;

/** Validates a patch, or returns why it can't be applied. */
export function parseProfilePatch(body: unknown): ProfilePatch | string {
  if (typeof body !== "object" || body === null) return "Invalid profile update";
  const candidate = body as Record<string, unknown>;
  const patch: ProfilePatch = {};
  if ("avatar" in candidate) {
    if (candidate.avatar !== null && !isValidAvatar(candidate.avatar)) {
      return "That picture can't be used — try a different photo";
    }
    patch.avatar = candidate.avatar;
  }
  if ("displayName" in candidate) {
    if (candidate.displayName !== null && typeof candidate.displayName !== "string") {
      return "Invalid profile update";
    }
    const name =
      candidate.displayName === null ? null : normalizeDisplayName(candidate.displayName);
    const invalid = name === null || name === "" ? null : displayNameError(name);
    if (invalid) return invalid;
    patch.displayName = name === "" ? null : name;
  }
  if ("bio" in candidate) {
    if (candidate.bio !== null && typeof candidate.bio !== "string") {
      return "Invalid profile update";
    }
    const bio = candidate.bio === null ? null : normalizeBio(candidate.bio);
    const invalid = bio === null || bio === "" ? null : bioError(bio);
    if (invalid) return invalid;
    patch.bio = bio === "" ? null : bio;
  }
  for (const key of [
    "shareWorkouts",
    "shareWorkoutDetails",
    "discoverableByFriendsOfFriends",
    "shareLeaderboards",
    "shareRelativeStrength",
  ] as const) {
    if (key in candidate) {
      if (typeof candidate[key] !== "boolean") return "Invalid profile update";
      patch[key] = candidate[key];
    }
  }
  return Object.keys(patch).length === 0 ? "Invalid profile update" : patch;
}

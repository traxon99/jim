/**
 * Background for a person's initial when they have no picture: one of a
 * fixed set of solid colors picked from their username, so the same friend
 * always gets the same color on every screen (the social mockups, #746).
 */
const AVATAR_COLORS = [
  "bg-rose-600",
  "bg-orange-600",
  "bg-amber-600",
  "bg-emerald-600",
  "bg-teal-600",
  "bg-sky-600",
  "bg-blue-600",
  "bg-indigo-600",
  "bg-violet-600",
  "bg-fuchsia-600",
] as const;

export function avatarColor(username: string | null): string {
  if (!username) return "bg-zinc-500";
  let hash = 0;
  for (const char of username) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? "bg-zinc-500";
}

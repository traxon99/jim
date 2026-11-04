import { avatarColor } from "@/lib/friends/avatar-color";

/**
 * A person's profile picture (issue #316), or the first letter of their
 * username on a color of their own when they haven't set one. Decorative: the username is always
 * shown next to it.
 */
export function Avatar({
  username,
  avatar,
  className = "h-10 w-10 text-base",
}: {
  username: string | null;
  avatar: string | null;
  /** Size and initial's text size. */
  className?: string;
}) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt=""
        aria-hidden="true"
        className={`shrink-0 rounded-full bg-zinc-100 object-cover dark:bg-zinc-900 ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold uppercase text-white ${avatarColor(username)} ${className}`}
    >
      {username?.charAt(0) ?? ""}
    </span>
  );
}

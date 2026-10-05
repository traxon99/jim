export type ShareUrlOutcome = "shared" | "copied" | "cancelled" | "unavailable";

type ShareNavigator = Pick<Navigator, "share" | "clipboard">;

/**
 * Hands a share link (issue #254) to the OS share sheet, falling back to the
 * clipboard where Web Share isn't available or fails for any reason other
 * than the user dismissing the sheet. Call it straight from a tap.
 */
export async function shareUrl(
  title: string,
  url: string,
  nav: Partial<ShareNavigator> | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): Promise<ShareUrlOutcome> {
  if (nav?.share) {
    try {
      await nav.share({ title, url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // fall through to the clipboard fallback below
    }
  }
  if (nav?.clipboard) {
    try {
      await nav.clipboard.writeText(url);
      return "copied";
    } catch {
      return "unavailable";
    }
  }
  return "unavailable";
}

/** What both iOS and Chromium report once the app is on the home screen. */
export const STANDALONE_MEDIA_QUERY = "(display-mode: standalone)";

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia(STANDALONE_MEDIA_QUERY).matches ||
    // iOS Safari's legacy signal — matchMedia alone isn't fully reliable there.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

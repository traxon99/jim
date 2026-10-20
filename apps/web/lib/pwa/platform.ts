export type InstallPlatform = "ios" | "android" | "in-app" | "other";

/**
 * Apps that open links in their own browser, where Add to Home Screen isn't
 * offered: Instagram, Facebook and Messenger, the Google app (Gmail's links),
 * LINE, Snapchat, LinkedIn, X and TikTok. A shared Jim link usually lands
 * in one of these (#676).
 */
const IN_APP_BROWSER =
  /Instagram|FBAN|FBAV|FB_IAB|Messenger|GSA\/|Line\/|Snapchat|LinkedInApp|Twitter|musical_ly|BytedanceWebview/i;

/**
 * Coarse UA sniff for picking which install steps to show — never for
 * feature gating. iPadOS reports as desktop Safari, so a "Macintosh" with a
 * touch screen is an iPad (as in detectPushSupport, #676).
 */
export function detectInstallPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  if (IN_APP_BROWSER.test(userAgent)) return "in-app";
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipod|ipad/i.test(userAgent)) return "ios";
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return "ios";
  return "other";
}

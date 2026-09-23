export type InstallPlatform = "ios" | "android" | "other";

/**
 * Coarse UA sniff for picking which install steps to show — never for
 * feature gating. iPadOS reports as desktop Safari and gets "other", which
 * still points people at the Share menu via the fallback copy.
 */
export function detectInstallPlatform(userAgent: string): InstallPlatform {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipod|ipad/i.test(userAgent)) return "ios";
  return "other";
}

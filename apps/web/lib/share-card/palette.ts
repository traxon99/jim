import type { ShareCardColor } from "@jim/core";

/**
 * Card gradients (issue #838): the routine's icon color, like the feed
 * post tints (`friends/post-media.ts`), but fixed hex values with no light/dark
 * pair. A shared image has no theme, so the card reads the same whichever one
 * the phone is in.
 */
export const CARD_GRADIENTS: Record<ShareCardColor, readonly [from: string, to: string]> = {
  red: ["#f87171", "#b91c1c"],
  orange: ["#fb923c", "#c2410c"],
  amber: ["#f59e0b", "#92400e"],
  green: ["#22c55e", "#166534"],
  teal: ["#14b8a6", "#115e59"],
  blue: ["#3b82f6", "#1e40af"],
  indigo: ["#6366f1", "#3730a3"],
  pink: ["#f472b6", "#be185d"],
  // No routine (an ad hoc workout) or no color: Jim's own deep zinc.
  default: ["#52525b", "#09090b"],
};

/** Text and fills on the card, all white at fixed opacities. */
export const CARD_INK = {
  text: "#ffffff",
  muted: "rgba(255,255,255,0.74)",
  faint: "rgba(255,255,255,0.18)",
  rule: "rgba(255,255,255,0.16)",
  /** Record pills: amber, readable on every gradient. */
  record: "#fde68a",
  recordInk: "#451a03",
} as const;

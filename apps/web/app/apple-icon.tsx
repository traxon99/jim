import { iconMark } from "@/lib/pwa/icon-mark";
import { ImageResponse } from "next/og";

// Full-bleed, no rounding — iOS applies its own squircle mask.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(iconMark({ size: 180 }), size);
}

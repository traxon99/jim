import { iconMark } from "@/lib/pwa/icon-mark";
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(iconMark({ size: 32, radius: 6 }), size);
}

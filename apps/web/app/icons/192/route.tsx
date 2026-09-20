import { iconMark } from "@/lib/pwa/icon-mark";
import { ImageResponse } from "next/og";

export async function GET() {
  return new ImageResponse(iconMark({ size: 192, radius: 32 }), { width: 192, height: 192 });
}

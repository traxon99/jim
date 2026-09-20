import { iconMark } from "@/lib/pwa/icon-mark";
import { ImageResponse } from "next/og";

export async function GET() {
  return new ImageResponse(iconMark({ size: 512, radius: 86 }), { width: 512, height: 512 });
}

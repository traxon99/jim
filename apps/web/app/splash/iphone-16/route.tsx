import { splashMark } from "@/lib/pwa/splash-mark";
import { ImageResponse } from "next/og";

const width = 393 * 3;
const height = 852 * 3;

export async function GET() {
  return new ImageResponse(splashMark({ width, height }), { width, height });
}

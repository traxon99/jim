import { iconMark } from "@/lib/pwa/icon-mark";
import { ImageResponse } from "next/og";

// Maskable: background fills the full canvas (radius 0, the OS applies its
// own shape) and content stays inside the ~80% safe-zone circle per the
// maskable icon spec, hence the padding.
export async function GET() {
  return new ImageResponse(iconMark({ size: 512, padding: 51 }), { width: 512, height: 512 });
}

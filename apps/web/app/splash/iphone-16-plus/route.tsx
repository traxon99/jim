import { SPLASH_DEVICES } from "@/lib/pwa/splash-devices";
import { splashImage } from "@/lib/pwa/splash-mark";

export async function GET() {
  return splashImage(SPLASH_DEVICES[2], "light");
}

import { SPLASH_DEVICES, findSplashDevice } from "@/lib/pwa/splash-devices";
import { splashImage } from "@/lib/pwa/splash-mark";

export const dynamicParams = false;

export function generateStaticParams() {
  return SPLASH_DEVICES.map((device) => ({ device: device.id }));
}

export async function GET(_request: Request, { params }: RouteContext<"/splash/[device]/dark">) {
  const device = findSplashDevice((await params).device);
  if (!device) return new Response(null, { status: 404 });
  return splashImage(device, "dark");
}

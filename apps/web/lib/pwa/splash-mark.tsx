import { ImageResponse } from "next/og";
import type { SplashDevice } from "./splash-devices";

/**
 * iOS's static launch image: a plain screen in the system theme's app
 * background (globals.css --background), with nothing on it. Apple's HIG asks
 * for a launch screen that looks like the app's first screen rather than a
 * branded splash; here that first screen is the boot splash
 * (components/loading-screen.tsx), which starts on the same blank background
 * and draws the "Jim" wordmark in. Putting a letter here instead would make
 * it jump when the web page takes over, since the image can't use the same
 * system font.
 */
export const SPLASH_BACKGROUND = { light: "#ffffff", dark: "#0a0a0a" } as const;

export type SplashScheme = keyof typeof SPLASH_BACKGROUND;

export function splashImage(device: SplashDevice, scheme: SplashScheme): ImageResponse {
  const width = device.cssWidth * device.dpr;
  const height = device.cssHeight * device.dpr;
  return new ImageResponse(
    <div style={{ width, height, display: "flex", background: SPLASH_BACKGROUND[scheme] }} />,
    { width, height },
  );
}

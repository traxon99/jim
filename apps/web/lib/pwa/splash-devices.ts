// iPhone 16 family, portrait only (see docs/ARCHITECTURE.md §6). CSS points
// per Apple's published specs; physical pixels = css * dpr.
export const SPLASH_DEVICES = [
  { id: "iphone-16", cssWidth: 393, cssHeight: 852, dpr: 3 },
  { id: "iphone-16-pro", cssWidth: 402, cssHeight: 874, dpr: 3 },
  { id: "iphone-16-plus", cssWidth: 430, cssHeight: 932, dpr: 3 },
] as const;

export type SplashDevice = (typeof SPLASH_DEVICES)[number];

export function splashMediaQuery(device: SplashDevice): string {
  return (
    `screen and (device-width: ${device.cssWidth}px) and (device-height: ${device.cssHeight}px) ` +
    `and (-webkit-device-pixel-ratio: ${device.dpr}) and (orientation: portrait)`
  );
}

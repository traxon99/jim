// Every iPhone screen size still on iOS versions Jim supports, portrait only
// (see docs/ARCHITECTURE.md §6). CSS points per Apple's published specs;
// physical pixels = css * dpr. A phone with no matching entry gets a blank
// white launch, which flashes white in dark mode (#672). Several models share
// a size, so one entry covers each group.
export const SPLASH_DEVICES = [
  // iPhone 16, 15, 15 Pro, 14 Pro
  { id: "iphone-16", cssWidth: 393, cssHeight: 852, dpr: 3 },
  // iPhone 17, 17 Pro, 16 Pro
  { id: "iphone-16-pro", cssWidth: 402, cssHeight: 874, dpr: 3 },
  // iPhone 16 Plus, 15 Plus, 15 Pro Max, 14 Pro Max
  { id: "iphone-16-plus", cssWidth: 430, cssHeight: 932, dpr: 3 },
  // iPhone 17 Pro Max, 16 Pro Max
  { id: "iphone-16-pro-max", cssWidth: 440, cssHeight: 956, dpr: 3 },
  // iPhone Air
  { id: "iphone-air", cssWidth: 420, cssHeight: 912, dpr: 3 },
  // iPhone 16e, 14, 13, 13 Pro, 12, 12 Pro
  { id: "iphone-14", cssWidth: 390, cssHeight: 844, dpr: 3 },
  // iPhone 14 Plus, 13 Pro Max, 12 Pro Max
  { id: "iphone-14-plus", cssWidth: 428, cssHeight: 926, dpr: 3 },
  // iPhone 13 mini, 12 mini, 11 Pro, XS, X
  { id: "iphone-13-mini", cssWidth: 375, cssHeight: 812, dpr: 3 },
  // iPhone 11, XR
  { id: "iphone-11", cssWidth: 414, cssHeight: 896, dpr: 2 },
  // iPhone 11 Pro Max, XS Max
  { id: "iphone-11-pro-max", cssWidth: 414, cssHeight: 896, dpr: 3 },
  // iPhone SE (2nd and 3rd generation), 8
  { id: "iphone-se", cssWidth: 375, cssHeight: 667, dpr: 2 },
] as const;

export type SplashDevice = (typeof SPLASH_DEVICES)[number];

export function splashMediaQuery(device: SplashDevice): string {
  return (
    `screen and (device-width: ${device.cssWidth}px) and (device-height: ${device.cssHeight}px) ` +
    `and (-webkit-device-pixel-ratio: ${device.dpr}) and (orientation: portrait)`
  );
}

export function findSplashDevice(id: string): SplashDevice | undefined {
  return SPLASH_DEVICES.find((device) => device.id === id);
}

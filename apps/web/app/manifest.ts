import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jim",
    short_name: "Jim",
    description: "A personal strength-training PWA.",
    // `id` pins the app's identity to the old start_url, so moving start_url
    // doesn't make Android treat it as a new app. Launching straight on
    // /workout skips the "/" redirect, and it's the page the service worker
    // keeps for offline launches (#661).
    id: "/",
    start_url: "/workout",
    display: "standalone",
    // No theme_color or background_color (#792). An installed Android app
    // paints the system navigation bar under the gesture handle from these,
    // and a manifest has one color for both themes, so a light one drew a
    // white strip under the dark app (and a dark one a black launch before a
    // light app, #681). Left out, Android follows the phone's light/dark
    // theme; the status bar follows Jim's theme via the viewport's
    // themeColor metas (lib/boot/color-scheme.ts).
    orientation: "portrait",
    // Long-press shortcut on Android (#681).
    shortcuts: [{ name: "Start workout", short_name: "Workout", url: "/workout" }],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

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
    // The app's light background: Android draws the launch screen and status
    // bar from these, and a dark one flashed before a white app (#681). The
    // viewport's themeColor pair follows the system theme after launch.
    background_color: "#ffffff",
    theme_color: "#ffffff",
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

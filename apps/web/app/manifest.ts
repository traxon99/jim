import { ICON_BACKGROUND } from "@/lib/pwa/icon-mark";
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
    background_color: ICON_BACKGROUND,
    theme_color: ICON_BACKGROUND,
    orientation: "portrait",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

import { AppReveal } from "@/components/app-reveal";
import { ColorSchemeEffect } from "@/components/color-scheme-effect";
import { InstallGate } from "@/components/install-gate";
import { LoadingScreen } from "@/components/loading-screen";
import { PwaChrome } from "@/components/pwa-chrome";
import { RegisterServiceWorker } from "@/components/register-service-worker";
import { RippleEffect } from "@/components/ripple-effect";
import { StatusBarScrim } from "@/components/status-bar-scrim";
import { COLD_OPEN_SCRIPT } from "@/lib/boot/cold-open";
import { COLOR_SCHEME_SCRIPT } from "@/lib/boot/color-scheme";
import { INSTALL_PROMPT_SCRIPT } from "@/lib/pwa/install-prompt";
import { SPLASH_DEVICES, splashMediaQuery } from "@/lib/pwa/splash-devices";
import type { Metadata, Viewport } from "next";
import { Geist_Mono, Playfair_Display, Roboto } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";

// The default ("sans") font choice (Profile > Appearance > Font).
const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The "serif" font choice (Profile > Appearance > Font, components/profile/font-family-section.tsx).
const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jim",
  description: "A personal strength-training PWA.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Jim",
    statusBarStyle: "black-translucent",
    // Light and dark launch images, so a cold open starts on the system
    // theme's background, the same one the boot splash draws on.
    startupImage: SPLASH_DEVICES.flatMap((device) => [
      {
        url: `/splash/${device.id}`,
        media: `${splashMediaQuery(device)} and (prefers-color-scheme: light)`,
      },
      {
        url: `/splash/${device.id}/dark`,
        media: `${splashMediaQuery(device)} and (prefers-color-scheme: dark)`,
      },
    ]),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No pinch-zoom: a zoomed-out-and-stuck layout is the most browser-like
  // failure there is, and `touch-action: manipulation` doesn't cover it — it
  // kills double-tap zoom but explicitly still permits continuous zooming.
  // iOS honors this in a standalone app (it ignores it in a Safari tab, which
  // here only ever shows the install gate).
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Matches --background in each system theme (#681).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${roboto.variable} ${geistMono.variable} ${playfairDisplay.variable} h-full antialiased`}
      // The cold-open script below sets data-boot before React hydrates.
      suppressHydrationWarning
    >
      <head>
        {/* Marks this load cold or warm before first paint, so the splash
            shows the right intro without a flash (lib/boot/cold-open.ts). */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed, build-time string with no user input. */}
        <script dangerouslySetInnerHTML={{ __html: COLD_OPEN_SCRIPT }} />
        {/* Applies the in-app Light/Dark choice before first paint, splash
            included (lib/boot/color-scheme.ts, #669). */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed, build-time string with no user input. */}
        <script dangerouslySetInnerHTML={{ __html: COLOR_SCHEME_SCRIPT }} />
        {/* Chrome fires beforeinstallprompt once, possibly before React
            hydrates; keep it for the install gate's button (#676). */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed, build-time string with no user input. */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_PROMPT_SCRIPT }} />
      </head>
      <body className="flex h-lvh flex-col">
        <LoadingScreen />
        <RegisterServiceWorker />
        <PwaChrome />
        <RippleEffect />
        <ColorSchemeEffect />
        <AppReveal>
          {/* InstallGate reads the query string (useSearchParams), which needs a
              Suspense boundary. It renders nothing on the server anyway. */}
          <Suspense fallback={null}>
            <InstallGate>{children}</InstallGate>
          </Suspense>
        </AppReveal>
        <StatusBarScrim />
      </body>
    </html>
  );
}

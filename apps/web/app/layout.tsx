import { InstallGate } from "@/components/install-gate";
import { PwaChrome } from "@/components/pwa-chrome";
import { RegisterServiceWorker } from "@/components/register-service-worker";
import { ICON_BACKGROUND } from "@/lib/pwa/icon-mark";
import { SPLASH_DEVICES, splashMediaQuery } from "@/lib/pwa/splash-devices";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
    startupImage: SPLASH_DEVICES.map((device) => ({
      url: `/splash/${device.id}`,
      media: splashMediaQuery(device),
    })),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: ICON_BACKGROUND,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <RegisterServiceWorker />
        <PwaChrome />
        <InstallGate>{children}</InstallGate>
      </body>
    </html>
  );
}

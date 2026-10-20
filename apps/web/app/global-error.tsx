"use client";

import { ErrorScreen } from "@/components/error-screen";
import { COLOR_SCHEME_KEY, prefersDark } from "@/lib/boot/color-scheme";
import { useEffect } from "react";
import "./globals.css";

// Replaces the root layout when it throws, so it brings its own document and
// styles. The in-app theme lives in Dexie, which may be what broke, so this
// reads the copy kept for first paint (#664, #669).
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(COLOR_SCHEME_KEY);
    } catch {}
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", prefersDark(stored, systemDark));
  }, []);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex h-lvh flex-col">
        <title>Jim</title>
        <ErrorScreen error={error} />
      </body>
    </html>
  );
}

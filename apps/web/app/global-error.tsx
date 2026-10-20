"use client";

import { ErrorScreen } from "@/components/error-screen";
import { useEffect } from "react";
import "./globals.css";

// Replaces the root layout when it throws, so it brings its own document and
// styles. The in-app theme lives in Dexie, which may be what broke, so this
// follows the system theme (#664).
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
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

"use client";

import { usePathname } from "next/navigation";

// Remounting on pathname change (via `key`) restarts the CSS fade-in
// animation defined in globals.css for every tab switch.
export function PageFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="page-fade flex flex-1 flex-col">
      {children}
    </div>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { Activity, type ReactNode } from "react";

const BASE_TABS = ["/workout", "/routines", "/history", "/exercises", "/profile"] as const;

type BaseTab = (typeof BASE_TABS)[number];

/**
 * Keeps all five tab home screens mounted at once instead of the default
 * Next.js behavior of tearing one down and building the next from scratch
 * on every tab switch. Inactive tabs render into React's `Activity` boundary
 * with `mode="hidden"` (display: none, effects still settle in the
 * background) so switching tabs is just a visibility flip, not a fresh
 * mount + data load.
 *
 * Non-tab routes (e.g. /workout/[id]) aren't part of this — they render
 * through `children` as normal routed pages, with every tab hidden
 * underneath.
 */
export function TabbedShell({
  workout,
  routines,
  history,
  exercises,
  profile,
  children,
}: {
  workout: ReactNode;
  routines: ReactNode;
  history: ReactNode;
  exercises: ReactNode;
  profile: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isBaseTab = (BASE_TABS as readonly string[]).includes(pathname);
  // Exercise detail is a floating card over the Exercises tab (issue #294),
  // so that tab stays visible underneath instead of a blank page.
  const isExerciseCard = /^\/exercises\/(?!new$)[^/]+$/.test(pathname);
  const activeTab: string = isExerciseCard ? "/exercises" : pathname;

  const content: Record<BaseTab, ReactNode> = {
    "/workout": workout,
    "/routines": routines,
    "/history": history,
    "/exercises": exercises,
    "/profile": profile,
  };

  return (
    <>
      {BASE_TABS.map((href) => (
        <Activity key={href} mode={activeTab === href ? "visible" : "hidden"}>
          <div className="page-fade flex min-h-0 flex-1 flex-col">{content[href]}</div>
        </Activity>
      ))}
      {isExerciseCard && children}
      {!isBaseTab && !isExerciseCard && (
        // Keyed by pathname: sub-routes (e.g. /workout/[id]) still fully
        // remount on navigation, same as before this component existed.
        <div key={pathname} className="route-fade flex min-h-0 flex-1 flex-col">
          {children}
        </div>
      )}
    </>
  );
}

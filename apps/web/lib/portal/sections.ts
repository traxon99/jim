import { ANALYSIS_RANGES, type AnalysisRange, DEFAULT_ANALYSIS_RANGE } from "@jim/core";
import { PORTAL_PATH } from "../pwa/install-gate-exempt";

export type PortalSectionId = "overview" | "workouts" | "exercises";

/**
 * The desktop Analysis sections (issue #470), in nav order. Each is its own
 * route under /portal so it loads only the data it shows. New sections join
 * this list as they ship.
 */
export const PORTAL_SECTIONS: readonly { id: PortalSectionId; label: string; href: string }[] = [
  { id: "overview", label: "Overview", href: PORTAL_PATH },
  { id: "workouts", label: "Workouts", href: `${PORTAL_PATH}/workouts` },
  { id: "exercises", label: "Exercises", href: `${PORTAL_PATH}/exercises` },
];

/** The section a /portal pathname belongs to, so the nav can mark it. */
export function activePortalSection(pathname: string): PortalSectionId {
  let active: PortalSectionId = "overview";
  for (const section of PORTAL_SECTIONS) {
    if (section.href === PORTAL_PATH) continue;
    if (pathname === section.href || pathname.startsWith(`${section.href}/`)) active = section.id;
  }
  return active;
}

/**
 * The time range in a `?range=` value, so the chosen range survives moving
 * between sections. Anything unrecognised falls back to the default.
 */
export function parseAnalysisRange(value: string | null | undefined): AnalysisRange {
  return ANALYSIS_RANGES.find((option) => option.id === value)?.id ?? DEFAULT_ANALYSIS_RANGE;
}

/** A section link that keeps the current range, leaving the default out of the URL. */
export function portalHref(href: string, range: AnalysisRange): string {
  return range === DEFAULT_ANALYSIS_RANGE ? href : `${href}?range=${range}`;
}

// Content lives in the layout (app/(shell)/layout.tsx) via TabbedShell, so
// all five tabs mount once and stay alive across tab switches. This route
// still needs a page.tsx to exist for Next.js to match /routines at all.
export default function RoutinesPage() {
  return null;
}

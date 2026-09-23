// Content lives in the layout (app/(shell)/layout.tsx) via TabbedShell, so
// all five tabs mount once and stay alive across tab switches. This route
// still needs a page.tsx to exist for Next.js to match /exercises at all.
export default function ExercisesPage() {
  return null;
}

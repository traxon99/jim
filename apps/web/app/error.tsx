"use client";

import { ErrorScreen } from "@/components/error-screen";

// Catches render errors in every page and the shell layout (the tabs render
// there), inside the root layout so theme and fonts still apply (#664).
export default function AppError({ error }: { error: Error & { digest?: string } }) {
  return <ErrorScreen error={error} />;
}

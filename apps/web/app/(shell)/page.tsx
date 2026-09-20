import { estimateOneRepMax } from "@jim/core";

// Placeholder home page for S0 (monorepo scaffold). Confirms the Next.js
// app boots and that @jim/core resolves across the workspace boundary.
// Real routes (/workout, /routines, /history, /exercises, /settings) land
// in later stories — see docs/STORIES.md.
export default function Home() {
  const sample = estimateOneRepMax(225, 5);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 bg-zinc-50 px-6 text-center font-sans dark:bg-black">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Jim</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Scaffold booted. @jim/core wired: estimateOneRepMax(225, 5) = {sample}
      </p>
    </main>
  );
}

import { Loader2 } from "lucide-react";

// Shown the moment a route inside the shell is tapped, while its server
// round trip is still out (#662). Without it a tap on weak gym signal looked
// like it did nothing. Tabs render from the layout, so a tab switch flips
// straight away and this only shows on pushed pages (TabbedShell). The
// spinner waits 300 ms (`route-loading`) so a fast load never flashes it.
export default function ShellLoading() {
  return (
    <div className="flex flex-1 items-center justify-center py-24" aria-busy="true">
      <Loader2
        className="route-loading h-6 w-6 animate-spin text-zinc-400 dark:text-zinc-600"
        aria-label="Loading"
      />
    </div>
  );
}

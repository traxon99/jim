import { BottomTabBar } from "@/components/bottom-tab-bar";
import { ExercisesList } from "@/components/exercises/exercises-list";
import { HistoryHome } from "@/components/history/history-home";
import { HomeScreen } from "@/components/home/home-screen";
import { RoutinesList } from "@/components/routines/routines-list";
import { SyncEngineBoot } from "@/components/sync-engine-boot";
import { SyncStatusIndicator } from "@/components/sync-status-indicator";
import { TabbedShell } from "@/components/tabbed-shell";
import { WorkoutHome } from "@/components/workout/workout-home";
import { createClient } from "@/lib/supabase/server";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  // proxy.ts already redirects unauthenticated requests to /login — this is
  // only reached in the brief window before that redirect completes.
  const tabs = userId
    ? {
        workout: <WorkoutHome userId={userId} />,
        routines: <RoutinesList userId={userId} />,
        history: <HistoryHome />,
        exercises: <ExercisesList userId={userId} />,
        home: <HomeScreen />,
      }
    : { workout: null, routines: null, history: null, exercises: null, home: null };

  return (
    // data-edge-to-edge drops body's safe-area padding (globals.css): the
    // scroller below starts at the very top of the screen, so content scrolls
    // up under the status bar scrim instead of into a solid band (issue #305).
    <div data-edge-to-edge className="relative flex min-h-0 flex-1 flex-col">
      <SyncEngineBoot />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* The tab bar floats over the bottom of this scroller (content blurs
            under it), so pad by its measured height to keep the last row
            reachable. */}
        <div
          className="flex flex-1 flex-col"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "var(--tab-bar-height, 0px)",
          }}
        >
          <TabbedShell {...tabs}>{children}</TabbedShell>
        </div>
      </div>
      <BottomTabBar syncStatus={<SyncStatusIndicator />} />
    </div>
  );
}

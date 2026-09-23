import { BottomTabBar } from "@/components/bottom-tab-bar";
import { ExercisesList } from "@/components/exercises/exercises-list";
import { HistoryHome } from "@/components/history/history-home";
import { RoutinesList } from "@/components/routines/routines-list";
import { SyncEngineBoot } from "@/components/sync-engine-boot";
import { SyncStatusIndicator } from "@/components/sync-status-indicator";
import { TabbedShell } from "@/components/tabbed-shell";
import { WorkoutHome } from "@/components/workout/workout-home";
import { createClient } from "@/lib/supabase/server";
import { ProfileHome } from "./profile/profile-home";

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
        profile: <ProfileHome email={data?.claims.email} />,
      }
    : { workout: null, routines: null, history: null, exercises: null, profile: null };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SyncEngineBoot />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <TabbedShell {...tabs}>{children}</TabbedShell>
      </div>
      <SyncStatusIndicator />
      <BottomTabBar />
    </div>
  );
}

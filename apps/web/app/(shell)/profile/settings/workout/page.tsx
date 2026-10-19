import { BodyStatsSection } from "@/components/profile/body-stats-section";
import { SettingsSubPage } from "@/components/profile/settings-sub-page";
import { WorkoutSection } from "@/components/profile/workout-section";
import { createClient } from "@/lib/supabase/server";

/** Settings → Workout (issue #650): units, rest, idle workouts and body stats. */
export default async function WorkoutSettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  return (
    <SettingsSubPage title="Workout">
      <WorkoutSection />
      <BodyStatsSection userId={data?.claims.sub} />
    </SettingsSubPage>
  );
}

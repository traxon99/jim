import { LeaderboardsScreen } from "@/components/friends/leaderboards-screen";

// Opened from the trophy in the Friends tab's header (issue #837); the Friends
// tab stays highlighted (lib/navigation/tabs.ts).
export default function LeaderboardsPage() {
  return <LeaderboardsScreen />;
}

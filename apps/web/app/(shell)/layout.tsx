import { BottomTabBar } from "@/components/bottom-tab-bar";
import { SyncEngineBoot } from "@/components/sync-engine-boot";
import { SyncStatusIndicator } from "@/components/sync-status-indicator";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <SyncEngineBoot />
      <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
      <SyncStatusIndicator />
      <BottomTabBar />
    </div>
  );
}

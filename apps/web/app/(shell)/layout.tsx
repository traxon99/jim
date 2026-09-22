import { BottomTabBar } from "@/components/bottom-tab-bar";
import { PageFade } from "@/components/page-fade";
import { PrefetchBaseRoutes } from "@/components/prefetch-base-routes";
import { SyncEngineBoot } from "@/components/sync-engine-boot";
import { SyncStatusIndicator } from "@/components/sync-status-indicator";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SyncEngineBoot />
      <PrefetchBaseRoutes />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <PageFade>{children}</PageFade>
      </div>
      <SyncStatusIndicator />
      <BottomTabBar />
    </div>
  );
}

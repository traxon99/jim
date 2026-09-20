import { BottomTabBar } from "@/components/bottom-tab-bar";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
      <BottomTabBar />
    </div>
  );
}

"use client";

import { Grid3x3, Scale, Trophy } from "lucide-react";

export type ProfileTab = "posts" | "records" | "body";

const TABS: readonly { id: ProfileTab; label: string; Icon: typeof Grid3x3 }[] = [
  { id: "posts", label: "Posts", Icon: Grid3x3 },
  { id: "records", label: "Records", Icon: Trophy },
  { id: "body", label: "Body", Icon: Scale },
];

export function ProfileTabs({
  active,
  onChange,
  showBody,
}: {
  active: ProfileTab;
  onChange: (tab: ProfileTab) => void;
  showBody: boolean;
}) {
  const tabs = showBody ? TABS : TABS.filter((tab) => tab.id !== "body");
  return (
    <div
      role="tablist"
      aria-label="Profile"
      className="flex border-b border-zinc-200 dark:border-zinc-800"
    >
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          aria-label={label}
          onClick={() => onChange(id)}
          className={`flex min-h-11 flex-1 items-center justify-center border-b-2 ${
            active === id
              ? "border-zinc-950 text-zinc-950 dark:border-zinc-50 dark:text-zinc-50"
              : "border-transparent text-zinc-400 dark:text-zinc-600"
          }`}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

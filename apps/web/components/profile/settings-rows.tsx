import type { IconComponent } from "@/components/icons/solar";

/** A grouped card of settings rows, inset dividers between them (#854). */
export const SETTINGS_GROUP =
  "surface flex w-full flex-col divide-y divide-zinc-200/80 overflow-hidden rounded-3xl dark:divide-zinc-800";
/** One row of a {@link SETTINGS_GROUP}: icon tile, label, then its control. */
export const SETTINGS_ROW = "flex min-h-12 items-center gap-3 px-4 py-2 text-base";

export function IconTile({ icon: Icon, className }: { icon: IconComponent; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-white ${className}`}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
    </span>
  );
}

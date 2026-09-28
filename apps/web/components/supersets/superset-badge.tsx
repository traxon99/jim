/** "A1"-style badge marking an exercise's place in a superset (issue #228). */
export function SupersetBadge({ label }: { label: string }) {
  return (
    <span className="rounded bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-foreground">
      {label}
    </span>
  );
}

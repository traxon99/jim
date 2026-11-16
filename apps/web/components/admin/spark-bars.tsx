/** A failure group's events per bucket (issue #810), as small bars. */
export function SparkBars({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  const width = 120;
  const height = 24;
  const slot = width / Math.max(1, values.length);
  const bar = Math.max(1, slot - 2);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className="text-zinc-400 dark:text-zinc-500"
    >
      {values.map((value, i) => {
        // An empty bucket keeps a 1px tick, so the timeline still reads.
        const h = value === 0 ? 1 : Math.max(3, (value / max) * height);
        return (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: one bar per bucket, in order
            key={i}
            x={i * slot + (slot - bar) / 2}
            y={height - h}
            width={bar}
            height={h}
            rx={value === 0 ? 0 : Math.min(1.5, bar / 2)}
            fill="currentColor"
            opacity={value === 0 ? 0.5 : 1}
          >
            <title>{value}</title>
          </rect>
        );
      })}
    </svg>
  );
}

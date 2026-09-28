const WIDTH = 96;
const HEIGHT = 28;
const PAD = 3;

/**
 * A tiny step-free line of one exercise's PR climb (issue #237) — each
 * point is a new best, spaced by when it was set. Decorative: the numbers
 * it summarizes are listed right beside it, so it's hidden from screen
 * readers rather than given its own description.
 */
export function PrSparkline({
  points,
}: { points: readonly { value: number; achievedAt: Date }[] }) {
  if (points.length < 2) return null;

  const times = points.map((point) => point.achievedAt.getTime());
  const values = points.map((point) => point.value);
  const minTime = Math.min(...times);
  const timeSpan = Math.max(...times) - minTime;
  const minValue = Math.min(...values);
  const valueSpan = Math.max(...values) - minValue || 1;

  const coords = points.map((point, index) => {
    const xFraction =
      timeSpan > 0 ? ((times[index] ?? minTime) - minTime) / timeSpan : index / (points.length - 1);
    const x = PAD + xFraction * (WIDTH - PAD * 2);
    const y = HEIGHT - PAD - ((point.value - minValue) / valueSpan) * (HEIGHT - PAD * 2);
    return [x, y] as const;
  });
  const [lastX, lastY] = coords[coords.length - 1] ?? [0, 0];
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${PAD},${HEIGHT - PAD} ${line} ${lastX.toFixed(1)},${HEIGHT - PAD}`;

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="shrink-0 text-accent"
      aria-hidden="true"
    >
      <polygon points={area} fill="currentColor" opacity={0.12} />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill="currentColor" />
    </svg>
  );
}

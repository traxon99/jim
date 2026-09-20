/** Placeholder brand mark for generated icons — swap for real artwork later. */
export const ICON_BACKGROUND = "#18181b"; // zinc-900
export const ICON_FOREGROUND = "#fafafa"; // zinc-50

export function iconMark({
  size,
  radius = 0,
  padding = 0,
}: {
  size: number;
  radius?: number;
  padding?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: ICON_BACKGROUND,
        borderRadius: radius,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: size - padding * 2,
          height: size - padding * 2,
          fontSize: (size - padding * 2) * 0.6,
          fontWeight: 700,
          fontFamily: "sans-serif",
          color: ICON_FOREGROUND,
        }}
      >
        J
      </div>
    </div>
  );
}

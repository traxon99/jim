import { ICON_BACKGROUND, ICON_FOREGROUND } from "./icon-mark";

export function splashMark({ width, height }: { width: number; height: number }) {
  const fontSize = Math.round(Math.min(width, height) * 0.18);
  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: ICON_BACKGROUND,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize,
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

import { ImageResponse } from "next/og";

// Android draws a notification's badge as a silhouette from its alpha
// channel, so the full-color icon showed as a white square (#681). This is
// the mark alone, white on transparent.
export async function GET() {
  return new ImageResponse(
    <div
      style={{
        width: 96,
        height: 96,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 72,
        fontWeight: 700,
        fontFamily: "sans-serif",
        color: "#ffffff",
      }}
    >
      J
    </div>,
    { width: 96, height: 96 },
  );
}

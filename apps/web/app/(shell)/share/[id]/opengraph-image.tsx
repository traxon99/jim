import { ICON_BACKGROUND, ICON_FOREGROUND, iconMark } from "@/lib/pwa/icon-mark";
import { loadSharePreview } from "@/lib/sharing/preview";
import { listNames, shareSummaryStats } from "@jim/core";
import { ImageResponse } from "next/og";

// The image on a share link's preview card (issue #431): what's shared, its
// rough size and who shared it, readable at a chat bubble's thumbnail size.

export const alt = "A shared Jim routine";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MUTED = "#a1a1aa"; // zinc-400
const PILL = "#27272a"; // zinc-800

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const preview = await loadSharePreview(id);
  const summary = preview?.summary ?? null;
  const label = summary?.kind === "program" ? "PROGRAM" : "ROUTINE";
  const names = summary
    ? listNames(summary.kind === "program" ? summary.routineNames : summary.exerciseNames, 4)
    : "";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: ICON_BACKGROUND,
        color: ICON_FOREGROUND,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {/* The mark is the page's own color here, so outline it. */}
        <div style={{ display: "flex", border: `2px solid ${PILL}`, borderRadius: 16 }}>
          {iconMark({ size: 64, radius: 14 })}
        </div>
        <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: MUTED }}>
          {summary ? `Jim · ${label}` : "Jim"}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div
          style={{
            display: "flex",
            fontSize: 84,
            fontWeight: 700,
            lineHeight: 1.05,
            // Two lines at most; Satori clips the rest.
            maxHeight: 180,
            overflow: "hidden",
          }}
        >
          {summary?.name ?? "This link doesn't work anymore"}
        </div>
        {summary && (
          <div style={{ display: "flex", gap: 16 }}>
            {shareSummaryStats(summary).map((stat) => (
              <div
                key={stat}
                style={{
                  display: "flex",
                  fontSize: 36,
                  fontWeight: 600,
                  padding: "12px 28px",
                  borderRadius: 999,
                  background: PILL,
                }}
              >
                {stat}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 30, color: MUTED }}>
        {names && <div style={{ display: "flex" }}>{names}</div>}
        {preview?.username && (
          <div style={{ display: "flex" }}>{`Shared by ${preview.username}`}</div>
        )}
      </div>
    </div>,
    size,
  );
}

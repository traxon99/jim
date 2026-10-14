import { ICON_BACKGROUND, ICON_FOREGROUND, iconMark } from "@/lib/pwa/icon-mark";
import { loadSharePreview } from "@/lib/sharing/preview";
import { shareSummaryStats } from "@jim/core";
import { ImageResponse } from "next/og";

// The image on a share link's preview card (issue #431): what's shared, its
// rough size, who shared it and its first few exercises (issue #638),
// readable at a chat bubble's thumbnail size.

export const alt = "A shared Jim routine";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MUTED = "#a1a1aa"; // zinc-400
const PILL = "#27272a"; // zinc-800

/** Exercises (or a program's routines) listed on the image before "+N more". */
const LISTED = 6;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const preview = await loadSharePreview(id);
  const summary = preview?.summary ?? null;
  const label = summary?.kind === "program" ? "PROGRAM" : "ROUTINE";
  const names = summary
    ? summary.kind === "program"
      ? summary.routineNames
      : summary.exerciseNames
    : [];
  const listed = names.slice(0, names.length > LISTED ? LISTED - 1 : LISTED);
  const more = names.length - listed.length;
  const rows = [
    ...listed.map((name, index) => ({ key: index, text: `${index + 1}. ${name}`, muted: false })),
    ...(more > 0 ? [{ key: listed.length, text: `+${more} more`, muted: true }] : []),
  ];
  // A short list stays in one column; a longer one splits in two.
  const half = rows.length <= 3 ? rows.length : Math.ceil(rows.length / 2);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "56px 72px",
        gap: 28,
        background: ICON_BACKGROUND,
        color: ICON_FOREGROUND,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {/* The mark is the page's own color here, so outline it. */}
        <div style={{ display: "flex", border: `2px solid ${PILL}`, borderRadius: 14 }}>
          {iconMark({ size: 56, radius: 12 })}
        </div>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: MUTED }}>
          {summary ? `Jim · ${label}` : "Jim"}
        </div>
        {preview?.username && (
          <div style={{ display: "flex", marginLeft: "auto", fontSize: 28, color: MUTED }}>
            {`Shared by ${preview.username}`}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 68,
          fontWeight: 700,
          lineHeight: 1.05,
          // Two lines at most; Satori clips the rest.
          maxHeight: 144,
          overflow: "hidden",
        }}
      >
        {summary?.name ?? "This link doesn't work anymore"}
      </div>

      {summary && (
        <div style={{ display: "flex", gap: 14 }}>
          {shareSummaryStats(summary).map((stat) => (
            <div
              key={stat}
              style={{
                display: "flex",
                fontSize: 28,
                fontWeight: 600,
                padding: "8px 22px",
                borderRadius: 999,
                background: PILL,
              }}
            >
              {stat}
            </div>
          ))}
        </div>
      )}

      {/* The exercises in two columns, read down then across (issue #638). */}
      {rows.length > 0 && (
        <div style={{ display: "flex", fontSize: 30 }}>
          {[rows.slice(0, half), rows.slice(half)].map((column, columnIndex) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: always the same two columns
              key={columnIndex}
              style={{ display: "flex", flexDirection: "column", gap: 10, width: "50%" }}
            >
              {column.map((row) => (
                <div
                  key={row.key}
                  style={{
                    display: "flex",
                    paddingRight: 24,
                    color: row.muted ? MUTED : ICON_FOREGROUND,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {row.text}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>,
    size,
  );
}

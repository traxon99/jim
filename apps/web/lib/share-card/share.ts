import { downloadFile } from "@/lib/data-transfer/export-build";

export type ShareImageOutcome = "shared" | "downloaded" | "cancelled";

/** "jim-bench-press-2026-09-28.png" from a card title and date. */
export function shareImageFileName(title: string, date: Date, size: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "card";
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return `jim-${slug}-${day}-${size}.png`;
}

/**
 * Opens the system share sheet with the image (and the card's text, where the
 * target keeps it); where files can't be shared it downloads the PNG instead
 * (issue #838). Call it straight from the tap with an already rendered image:
 * iOS refuses `share` once the tap's user activation has been spent waiting.
 */
export async function shareImage(
  blob: Blob,
  fileName: string,
  text: string,
  nav: Pick<Navigator, "share" | "canShare"> | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): Promise<ShareImageOutcome> {
  const file = new File([blob], fileName, { type: "image/png" });
  if (typeof nav?.canShare === "function" && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // Any other share failure falls through to a plain download.
    }
  }
  downloadFile(file);
  return "downloaded";
}

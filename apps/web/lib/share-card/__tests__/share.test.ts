import { describe, expect, it, vi } from "vitest";
import { shareImage, shareImageFileName } from "../share";

describe("shareImageFileName", () => {
  it("slugs the title and adds the date and size", () => {
    expect(shareImageFileName("Barbell Bench Press PR!", new Date(2026, 8, 3), "story")).toBe(
      "jim-barbell-bench-press-pr-2026-09-03-story.png",
    );
  });
});

describe("shareImage", () => {
  const blob = new Blob(["png"], { type: "image/png" });

  it("shares the file and the text where files can be shared", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const outcome = await shareImage(blob, "card.png", "Push day", {
      share,
      canShare: () => true,
    });
    expect(outcome).toBe("shared");
    const [data] = share.mock.calls[0] ?? [];
    expect(data.text).toBe("Push day");
    expect(data.files[0].name).toBe("card.png");
  });

  it("reports a dismissed sheet as cancelled, without downloading", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("closed", "AbortError"));
    expect(await shareImage(blob, "card.png", "", { share, canShare: () => true })).toBe(
      "cancelled",
    );
  });
});

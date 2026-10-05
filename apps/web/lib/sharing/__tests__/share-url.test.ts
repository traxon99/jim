import { describe, expect, it, vi } from "vitest";
import { shareUrl } from "../share-url";

const URL_TO_SHARE = "https://jim.example/share/abc";

describe("shareUrl", () => {
  it("uses the share sheet when there is one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await shareUrl("Push", URL_TO_SHARE, { share })).toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "Push", url: URL_TO_SHARE });
  });

  it("treats a dismissed sheet as cancelled, not a failure", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("no", "AbortError"));
    const writeText = vi.fn();
    expect(await shareUrl("Push", URL_TO_SHARE, { share, clipboard: { writeText } as never })).toBe(
      "cancelled",
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the link when the sheet fails or doesn't exist", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("no", "NotAllowedError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await shareUrl("Push", URL_TO_SHARE, { share, clipboard: { writeText } as never })).toBe(
      "copied",
    );
    expect(writeText).toHaveBeenCalledWith(URL_TO_SHARE);
    expect(await shareUrl("Push", URL_TO_SHARE, {})).toBe("unavailable");
  });
});

import { describe, expect, it } from "vitest";
import { isSharePreviewRequest } from "../preview-request";

const ID = "0b5f3c1e-2a4d-4c6b-9e8f-1a2b3c4d5e6f";
const IMESSAGE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0";
const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("isSharePreviewRequest", () => {
  it("lets chat apps' preview fetchers reach a share link", () => {
    expect(isSharePreviewRequest(`/share/${ID}`, IMESSAGE)).toBe(true);
    expect(isSharePreviewRequest(`/share/${ID}`, "Slackbot-LinkExpanding 1.0")).toBe(true);
    expect(isSharePreviewRequest(`/share/${ID}`, "Mozilla/5.0 (compatible; Discordbot/2.0)")).toBe(
      true,
    );
    expect(isSharePreviewRequest(`/share/${ID}`, "WhatsApp/2.23.20.0")).toBe(true);
  });

  it("still sends a person in a browser through sign-in", () => {
    expect(isSharePreviewRequest(`/share/${ID}`, SAFARI)).toBe(false);
    expect(isSharePreviewRequest(`/share/${ID}`, null)).toBe(false);
  });

  it("serves the preview image to anyone", () => {
    expect(isSharePreviewRequest(`/share/${ID}/opengraph-image-1x2y3z`, SAFARI)).toBe(true);
    expect(isSharePreviewRequest(`/share/${ID}/opengraph-image`, null)).toBe(true);
  });

  it("only opens share links, not the rest of the app", () => {
    expect(isSharePreviewRequest("/routines", IMESSAGE)).toBe(false);
    expect(isSharePreviewRequest(`/api/shares/${ID}`, IMESSAGE)).toBe(false);
    expect(isSharePreviewRequest(`/share/${ID}/other`, IMESSAGE)).toBe(false);
    expect(isSharePreviewRequest("/share/not-a-link", IMESSAGE)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { isPublicSharePath } from "../public-share";

const ID = "0b5f3c1e-2a4d-4c6b-9e8f-1a2b3c4d5e6f";

describe("isPublicSharePath", () => {
  it("lets anyone open a share link's page", () => {
    expect(isPublicSharePath(`/share/${ID}`)).toBe(true);
    expect(isPublicSharePath(`/share/${ID}/`)).toBe(true);
  });

  it("serves the preview image to anyone", () => {
    expect(isPublicSharePath(`/share/${ID}/opengraph-image-1x2y3z`)).toBe(true);
    expect(isPublicSharePath(`/share/${ID}/opengraph-image`)).toBe(true);
  });

  it("only opens share links, not the rest of the app or the API", () => {
    expect(isPublicSharePath("/routines")).toBe(false);
    expect(isPublicSharePath(`/api/shares/${ID}`)).toBe(false);
    expect(isPublicSharePath(`/share/${ID}/other`)).toBe(false);
    expect(isPublicSharePath("/share/not-a-link")).toBe(false);
  });
});

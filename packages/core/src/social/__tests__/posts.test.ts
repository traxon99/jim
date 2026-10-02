import { describe, expect, it } from "vitest";
import {
  POST_CAPTION_MAX_LENGTH,
  type PostDraft,
  isPostKind,
  normalizePostDraft,
  postDraftError,
} from "../posts";

const record: PostDraft = {
  kind: "record",
  sessionId: null,
  title: "Bench Press",
  detail: "225 lb × 5",
  caption: null,
};

describe("posts", () => {
  it("recognises only the stored kinds", () => {
    expect(isPostKind("achievement")).toBe(true);
    expect(isPostKind("photo")).toBe(false);
    expect(isPostKind(null)).toBe(false);
  });

  it("trims fields and turns blank ones into null", () => {
    expect(
      normalizePostDraft({ ...record, title: " Bench ", detail: " ", caption: " hi " }),
    ).toEqual({ ...record, title: "Bench", detail: null, caption: "hi" });
  });

  it("accepts a well-formed draft", () => {
    expect(postDraftError(record)).toBeNull();
    expect(postDraftError({ ...record, kind: "workout", sessionId: "s1" })).toBeNull();
  });

  it("rejects a missing title or an overlong caption", () => {
    expect(postDraftError({ ...record, title: "" })).toMatch(/title/);
    expect(postDraftError({ ...record, caption: "x".repeat(POST_CAPTION_MAX_LENGTH + 1) })).toMatch(
      /caption/,
    );
  });

  it("links a session only for workout posts", () => {
    expect(postDraftError({ ...record, kind: "workout" })).toMatch(/workout/);
    expect(postDraftError({ ...record, sessionId: "s1" })).not.toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { exerciseDemo, normalizeVideoUrl } from "../demo-video";

describe("normalizeVideoUrl", () => {
  it("keeps http(s) links and trims them", () => {
    expect(normalizeVideoUrl("  https://youtu.be/abc  ")).toBe("https://youtu.be/abc");
  });

  it("rejects blanks, junk and non-web schemes", () => {
    expect(normalizeVideoUrl("")).toBeNull();
    expect(normalizeVideoUrl("not a url")).toBeNull();
    expect(normalizeVideoUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("exerciseDemo", () => {
  it("uses the exercise's own link when it has one", () => {
    expect(exerciseDemo({ name: "Squat", videoUrl: "https://youtu.be/abc" })).toEqual({
      url: "https://youtu.be/abc",
      custom: true,
    });
  });

  it("falls back to a YouTube search for the exercise's form", () => {
    const demo = exerciseDemo({ name: "Barbell Bench Press", videoUrl: null });
    expect(demo.custom).toBe(false);
    expect(demo.url).toBe(
      "https://www.youtube.com/results?search_query=Barbell%20Bench%20Press%20exercise%20form",
    );
  });

  it("ignores a stored link that isn't a web URL", () => {
    expect(exerciseDemo({ name: "Squat", videoUrl: "javascript:alert(1)" }).custom).toBe(false);
  });
});

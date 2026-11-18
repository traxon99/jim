import { describe, expect, it } from "vitest";
import {
  type PhotoBodyMeasurementSource,
  type PhotoSource,
  bodyweightForPhoto,
  cleanPhotoNote,
  groupPhotosByMonth,
  photoCompare,
  photoObjectPaths,
} from "../index";

function photo(
  id: string,
  takenOn: string,
  pose: string | null = "front",
  extra = {},
): PhotoSource {
  return {
    id,
    takenOn,
    takenAt: new Date(`${takenOn}T12:00:00`),
    pose,
    deletedAt: null,
    ...extra,
  };
}

function weighIn(
  day: string,
  value: string,
  unit: "kg" | "lb" = "kg",
  extra: Partial<PhotoBodyMeasurementSource> = {},
): PhotoBodyMeasurementSource {
  return {
    kind: "bodyweight",
    value,
    unit,
    measuredAt: new Date(`${day}T08:00:00`),
    deletedAt: null,
    ...extra,
  };
}

describe("bodyweightForPhoto", () => {
  it("uses a weigh-in from the same day", () => {
    expect(bodyweightForPhoto("2026-03-10", [weighIn("2026-03-10", "82.40")], "kg")).toBe(82.4);
  });

  it("uses the latest weigh-in within 7 days before, never one after", () => {
    const rows = [
      weighIn("2026-03-03", "83.00"),
      weighIn("2026-03-08", "82.50"),
      weighIn("2026-03-12", "80.00"),
    ];
    expect(bodyweightForPhoto("2026-03-10", rows, "kg")).toBe(82.5);
  });

  it("takes a weigh-in exactly 7 days back but not 8", () => {
    expect(bodyweightForPhoto("2026-03-10", [weighIn("2026-03-03", "83.00")], "kg")).toBe(83);
    expect(bodyweightForPhoto("2026-03-10", [weighIn("2026-03-02", "83.00")], "kg")).toBeNull();
  });

  it("is none with no usable weigh-in", () => {
    expect(bodyweightForPhoto("2026-03-10", [], "kg")).toBeNull();
    const ignored = [
      weighIn("2026-03-10", "80", "kg", { deletedAt: new Date() }),
      weighIn("2026-03-10", "30", "kg", { kind: "waist" }),
    ];
    expect(bodyweightForPhoto("2026-03-10", ignored, "kg")).toBeNull();
  });

  it("converts to the display units", () => {
    expect(bodyweightForPhoto("2026-03-10", [weighIn("2026-03-10", "100.00", "kg")], "lb")).toBe(
      220.46,
    );
    expect(bodyweightForPhoto("2026-03-10", [weighIn("2026-03-10", "220.46", "lb")], "kg")).toBe(
      100,
    );
  });
});

describe("photoCompare", () => {
  const photos = [
    photo("a", "2026-01-01", "front"),
    photo("b", "2026-02-01", "front"),
    photo("c", "2026-03-01", "front"),
    photo("d", "2026-02-15", "side"),
    photo("gone", "2026-02-20", "front", { deletedAt: new Date() }),
  ];
  const weights = [weighIn("2026-01-01", "90"), weighIn("2026-03-01", "84.5")];

  it("labels each photo and measures change from the earliest to the latest", () => {
    const result = photoCompare({
      photos,
      bodyMeasurements: weights,
      units: "kg",
      selectedIds: ["c", "a"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.map((item) => item.photo.id)).toEqual(["c", "a"]);
    expect(result.items.map((item) => item.bodyweight)).toEqual([84.5, 90]);
    expect(result.elapsedDays).toBe(59);
    expect(result.bodyweightChange).toBe(-5.5);
  });

  it("has no change when either end has no bodyweight", () => {
    const result = photoCompare({
      photos,
      bodyMeasurements: [weighIn("2026-01-01", "90")],
      units: "kg",
      selectedIds: ["a", "c"],
    });
    expect(result.ok && result.bodyweightChange).toBeNull();
  });

  it("builds the slider sequence from live photos of the same pose", () => {
    const result = photoCompare({
      photos,
      bodyMeasurements: [],
      units: "kg",
      selectedIds: ["b", "d"],
    });
    if (!result.ok) throw new Error("expected ok");
    const [front, side] = result.items;
    expect(front?.sequenceIds).toEqual(["a", "b", "c"]);
    expect(front?.sequenceIndex).toBe(1);
    expect(side?.sequenceIds).toEqual(["d"]);
  });

  it("holds two to four photos", () => {
    const more = [...photos, photo("e", "2026-04-01"), photo("f", "2026-05-01")];
    const run = (selectedIds: string[]) =>
      photoCompare({ photos: more, bodyMeasurements: [], units: "kg", selectedIds });
    expect(run(["a"])).toEqual({ ok: false, reason: "too-few" });
    expect(run(["a", "b", "c", "e", "f"])).toEqual({ ok: false, reason: "too-many" });
    expect(run(["a", "b", "c", "e"]).ok).toBe(true);
    expect(run(["a", "gone"])).toEqual({ ok: false, reason: "missing" });
  });
});

describe("groupPhotosByMonth", () => {
  it("groups live photos by month, newest first", () => {
    const groups = groupPhotosByMonth([
      photo("a", "2026-01-05"),
      photo("b", "2026-02-10"),
      photo("c", "2026-02-20"),
      photo("x", "2026-02-25", "front", { deletedAt: new Date() }),
    ]);
    expect(groups.map((group) => group.month)).toEqual(["2026-02", "2026-01"]);
    expect(groups[0]?.photos.map((p) => p.id)).toEqual(["c", "b"]);
  });
});

describe("photoObjectPaths / cleanPhotoNote", () => {
  it("puts the owner's id first", () => {
    expect(photoObjectPaths("u1", "p1")).toEqual({
      thumbPath: "u1/p1/thumb.jpg",
      originalPath: "u1/p1/original.jpg",
    });
  });
  it("trims and caps notes", () => {
    expect(cleanPhotoNote("  ")).toBeNull();
    expect(cleanPhotoNote(" end of cut ")).toBe("end of cut");
    expect(cleanPhotoNote("x".repeat(500))?.length).toBe(200);
  });
});

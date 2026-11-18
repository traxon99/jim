import { jsonExportFromTables } from "@/lib/data-transfer/export-build";
import { type JimDatabase, createTestDb } from "@/lib/db/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveProgressPhoto } from "..";
import {
  PhotoExportOfflineError,
  buildPhotosExport,
  photoFileName,
  photoManifest,
} from "../export";
import type { PhotoStorage } from "../storage";

const USER = "11111111-1111-1111-1111-111111111111";
let database: JimDatabase;

beforeEach(() => {
  database = createTestDb(`jim-photo-export-${crypto.randomUUID()}`);
});
afterEach(async () => {
  await database.delete();
});

const jpeg = (text: string) => ({
  original: new Blob([text], { type: "image/jpeg" }),
  thumb: new Blob(["t"], { type: "image/jpeg" }),
  width: 3,
  height: 4,
  capturedAt: null,
});

describe("progress photo export", () => {
  it("includes photo metadata in the JSON export, without sync fields or deleted photos", async () => {
    const kept = await saveProgressPhoto(
      { userId: USER, photo: jpeg("a"), takenOn: "2026-03-10", pose: "front", note: "cut" },
      database,
    );
    const gone = await saveProgressPhoto(
      { userId: USER, photo: jpeg("b"), takenOn: "2026-03-11" },
      database,
    );
    const rows = [kept, { ...gone, deletedAt: new Date() }];

    const json = JSON.parse(
      jsonExportFromTables({
        sessions: [],
        sessionExercises: [],
        sets: [],
        exercises: [],
        routines: [],
        routineExercises: [],
        programs: [],
        programRoutines: [],
        personalRecords: [],
        bodyMeasurements: [],
        dprBlocks: [],
        dprBlockLifts: [],
        gyms: [],
        progressPhotos: rows,
        settings: undefined,
      }),
    );
    expect(json.progressPhotos).toHaveLength(1);
    expect(json.progressPhotos[0]).toMatchObject({
      id: kept.id,
      takenOn: "2026-03-10",
      pose: "front",
    });
    expect(json.progressPhotos[0]).not.toHaveProperty("deletedAt");
  });

  it("writes a manifest of date, pose and note, oldest first, quoting commas", async () => {
    const a = await saveProgressPhoto(
      {
        userId: USER,
        photo: jpeg("a"),
        takenOn: "2026-02-01",
        pose: "back",
        note: 'He said "go", so',
      },
      database,
    );
    const b = await saveProgressPhoto(
      { userId: USER, photo: jpeg("b"), takenOn: "2026-01-01" },
      database,
    );
    const manifest = photoManifest([a, b]);
    expect(manifest.split("\n")).toEqual([
      "file,date,pose,note",
      `${photoFileName(b)},2026-01-01,,`,
      `${photoFileName(a)},2026-02-01,Back,"He said ""go"", so"`,
      "",
    ]);
  });

  it("needs a connection", async () => {
    await expect(buildPhotosExport({ database, online: false })).rejects.toBeInstanceOf(
      PhotoExportOfflineError,
    );
  });

  it("zips every live photo's original with the manifest", async () => {
    await saveProgressPhoto({ userId: USER, photo: jpeg("one"), takenOn: "2026-01-01" }, database);
    await saveProgressPhoto({ userId: USER, photo: jpeg("two"), takenOn: "2026-02-01" }, database);
    const progress: number[] = [];
    const storage: PhotoStorage = {
      upload: async () => ({ error: null }),
      signedUrl: async () => null,
    };

    const zip = await buildPhotosExport({
      database,
      storage,
      online: true,
      onProgress: (done) => progress.push(done),
    });

    const text = new TextDecoder("latin1").decode(await zip.arrayBuffer());
    expect(text).toContain("manifest.csv");
    expect(text).toContain("one");
    expect(text).toContain("two");
    expect(progress).toEqual([1, 2]);
  });
});

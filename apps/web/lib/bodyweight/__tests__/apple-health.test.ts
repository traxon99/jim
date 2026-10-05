import { Blob } from "node:buffer";
import { deflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bodyweightOnDate, commitWeightImport, previewAppleHealthImport } from "..";
import { type JimDatabase, createTestDb } from "../../db/schema";
import { DEFAULT_SETTINGS } from "../../settings/defaults";
import { readAppleHealthWeights } from "../apple-health";

const USER_ID = "11111111-1111-1111-1111-111111111111";

function record(type: string, value: string, unit: string, date: string): string {
  return ` <Record type="${type}" sourceName="Scale" unit="${unit}" creationDate="${date}" startDate="${date}" endDate="${date}" value="${value}"/>\n`;
}

const EXPORT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_US">
${record("HKQuantityTypeIdentifierBodyMass", "180.4", "lb", "2024-01-15 07:05:12 -0500")}
${record("HKQuantityTypeIdentifierStepCount", "4000", "count", "2024-01-15 09:00:00 -0500")}
${record("HKQuantityTypeIdentifierBodyMass", "179.8", "lb", "2024-01-16 07:01:00 -0500")}
${record(
  "HKQuantityTypeIdentifierHeartRate",
  "62",
  "count/min",
  "2024-01-16 07:02:00 -0500",
).repeat(2000)}
${record("HKQuantityTypeIdentifierBodyMass", "81.2", "kg", "2024-01-20 07:00:00 -0500")}
</HealthData>
`;

/** A minimal zip like the Health app's: a folder, a CDA file, and export.xml. */
function zip(files: { name: string; data: Uint8Array; deflate: boolean }[]): Uint8Array {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const body = file.deflate ? deflateRawSync(file.data) : Buffer.from(file.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(file.deflate ? 8 : 0, 8);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(file.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(file.deflate ? 8 : 0, 10);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(file.data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    local.push(header, name, body);
    central.push(entry, name);
    offset += header.length + name.length + body.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...local, directory, end]));
}

function healthZip(deflate: boolean): globalThis.Blob {
  const xml = new TextEncoder().encode(EXPORT_XML);
  return new Blob([
    zip([
      { name: "apple_health_export/", data: new Uint8Array(), deflate: false },
      {
        name: "apple_health_export/export_cda.xml",
        data: new TextEncoder().encode("<ClinicalDocument/>"),
        deflate,
      },
      { name: "apple_health_export/export.xml", data: xml, deflate },
    ]),
  ]) as unknown as globalThis.Blob;
}

let testDb: JimDatabase;

beforeEach(async () => {
  testDb = createTestDb(`jim-apple-health-test-${crypto.randomUUID()}`);
  await testDb.settings.put({ ...DEFAULT_SETTINGS, units: "lb" });
});

afterEach(async () => {
  await testDb.delete();
});

describe("readAppleHealthWeights", () => {
  it("reads export.xml straight", async () => {
    const parsed = await readAppleHealthWeights(
      new Blob([EXPORT_XML]) as unknown as globalThis.Blob,
    );
    expect(parsed.entries.map((entry) => [entry.value, entry.unit])).toEqual([
      [180.4, "lb"],
      [179.8, "lb"],
      [81.2, "kg"],
    ]);
  });

  it("finds export.xml inside the zip, deflated or stored, and reports progress", async () => {
    for (const deflate of [true, false]) {
      const progress: number[] = [];
      const parsed = await readAppleHealthWeights(healthZip(deflate), (f) => progress.push(f));
      expect(parsed.format).toBe("apple-health");
      expect(parsed.entries).toHaveLength(3);
      expect(parsed.entries[0]?.measuredAt.toISOString()).toBe("2024-01-15T12:05:12.000Z");
      expect(progress.at(-1)).toBe(1);
    }
  });

  it("says so when the zip has no export.xml, or isn't an export", async () => {
    const noXml = new Blob([
      zip([{ name: "photos/a.jpg", data: new Uint8Array([1, 2, 3]), deflate: false }]),
    ]) as unknown as globalThis.Blob;
    await expect(readAppleHealthWeights(noXml)).rejects.toThrow(/no export.xml/);
    await expect(
      readAppleHealthWeights(new Blob(["just text"]) as unknown as globalThis.Blob),
    ).rejects.toThrow(/Apple Health export/);
  });
});

describe("previewAppleHealthImport", () => {
  it("imports bodyweight history once, and nothing on a second run", async () => {
    const preview = await previewAppleHealthImport(healthZip(true), undefined, testDb);
    expect(preview).toMatchObject({ format: "apple-health", duplicateCount: 0, needsUnit: false });
    expect(preview.entries).toHaveLength(3);
    const added = await commitWeightImport(
      { userId: USER_ID, entries: preview.entries, fileUnit: "lb" },
      testDb,
    );
    expect(added).toBe(3);

    const again = await previewAppleHealthImport(healthZip(true), undefined, testDb);
    expect(again.entries).toHaveLength(0);
    expect(again.duplicateCount).toBe(3);
  });
});

describe("bodyweightOnDate", () => {
  const point = (iso: string, value: number) => ({ id: iso, measuredAt: new Date(iso), value });
  const on = bodyweightOnDate([
    point("2024-01-01T08:00:00Z", 200),
    point("2024-02-01T08:00:00Z", 190),
    point("2024-03-01T08:00:00Z", 185),
  ]);

  it("uses the last weigh-in on or before the date", () => {
    expect(on(new Date("2024-02-01T08:00:00Z"))).toBe(190);
    expect(on(new Date("2024-02-20T08:00:00Z"))).toBe(190);
    expect(on(new Date("2025-01-01T08:00:00Z"))).toBe(185);
  });

  it("uses the first weigh-in before any, and null with none", () => {
    expect(on(new Date("2023-06-01T08:00:00Z"))).toBe(200);
    expect(bodyweightOnDate([])(new Date())).toBeNull();
  });
});

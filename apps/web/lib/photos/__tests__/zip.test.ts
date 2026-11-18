import { describe, expect, it } from "vitest";
import { buildZip, crc32 } from "../zip";

/** Reads a stored zip back by its central directory, the way an unzip tool does. */
async function readZip(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const files: { name: string; data: Uint8Array; crc: number }[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    const crc = view.getUint32(offset + 16, true);
    const size = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const local = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    const dataStart =
      local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    files.push({ name, data: bytes.slice(dataStart, dataStart + size), crc });
    offset += 46 + nameLength;
  }
  return files;
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("buildZip", () => {
  it("round-trips entries with their names, bytes and checksums", async () => {
    const files = await readZip(
      buildZip([
        { name: "2026-03-10-front-abcd1234.jpg", data: new Uint8Array([1, 2, 3, 255]) },
        { name: "manifest.csv", data: new TextEncoder().encode("file,date\n") },
      ]),
    );
    expect(files.map((f) => f.name)).toEqual(["2026-03-10-front-abcd1234.jpg", "manifest.csv"]);
    expect([...(files[0]?.data ?? [])]).toEqual([1, 2, 3, 255]);
    expect(new TextDecoder().decode(files[1]?.data)).toBe("file,date\n");
    expect(files[0]?.crc).toBe(crc32(new Uint8Array([1, 2, 3, 255])));
  });

  it("makes a valid empty archive", async () => {
    expect(await readZip(buildZip([]))).toEqual([]);
  });
});

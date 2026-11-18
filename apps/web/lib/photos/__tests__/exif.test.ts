import { describe, expect, it } from "vitest";
import { parseExifDateTime, readExifCaptureDate } from "../exif";

/** A JPEG that is just SOI + an APP1 EXIF block holding `DateTimeOriginal` (little-endian TIFF). */
function jpegWithExif(dateTime: string, opts: { tag?: number; bigEndian?: boolean } = {}) {
  const tag = opts.tag ?? 0x9003;
  const little = !opts.bigEndian;
  const text = `${dateTime}\0`;
  // TIFF: header (8) + IFD0 (2 + 12 + 4) + ExifIFD (2 + 12 + 4) + ascii.
  const ifd0 = 8;
  const exifIfd = ifd0 + 2 + 12 + 4;
  const ascii = exifIfd + 2 + 12 + 4;
  const tiff = new DataView(new ArrayBuffer(ascii + text.length));
  tiff.setUint16(0, little ? 0x4949 : 0x4d4d);
  tiff.setUint16(2, 0x002a, little);
  tiff.setUint32(4, ifd0, little);
  tiff.setUint16(ifd0, 1, little);
  tiff.setUint16(ifd0 + 2, 0x8769, little); // ExifIFD pointer
  tiff.setUint16(ifd0 + 4, 4, little);
  tiff.setUint32(ifd0 + 6, 1, little);
  tiff.setUint32(ifd0 + 10, exifIfd, little);
  tiff.setUint16(exifIfd, 1, little);
  tiff.setUint16(exifIfd + 2, tag, little);
  tiff.setUint16(exifIfd + 4, 2, little); // ASCII
  tiff.setUint32(exifIfd + 6, text.length, little);
  tiff.setUint32(exifIfd + 10, ascii, little);
  for (let i = 0; i < text.length; i++) tiff.setUint8(ascii + i, text.charCodeAt(i));

  const payload = new Uint8Array(6 + tiff.byteLength);
  payload.set([0x45, 0x78, 0x69, 0x66, 0, 0]); // "Exif\0\0"
  payload.set(new Uint8Array(tiff.buffer), 6);
  const bytes = new Uint8Array(2 + 4 + payload.length);
  bytes.set([0xff, 0xd8, 0xff, 0xe1]);
  new DataView(bytes.buffer).setUint16(4, payload.length + 2);
  bytes.set(payload, 6);
  return bytes.buffer;
}

describe("parseExifDateTime", () => {
  it("reads EXIF's colon-separated local time", () => {
    const date = parseExifDateTime("2026:03:10 07:45:12");
    expect(date).toEqual(new Date(2026, 2, 10, 7, 45, 12));
  });

  it("rejects blanks, zero dates and impossible days", () => {
    expect(parseExifDateTime("    :  :     :  :  ")).toBeNull();
    expect(parseExifDateTime("0000:00:00 00:00:00")).toBeNull();
    expect(parseExifDateTime("2026:02:31 10:00:00")).toBeNull();
    expect(parseExifDateTime("not a date")).toBeNull();
  });
});

describe("readExifCaptureDate", () => {
  it("finds DateTimeOriginal in either byte order", () => {
    expect(readExifCaptureDate(jpegWithExif("2025:11:02 18:30:00"))).toEqual(
      new Date(2025, 10, 2, 18, 30, 0),
    );
    expect(readExifCaptureDate(jpegWithExif("2025:11:02 18:30:00", { bigEndian: true }))).toEqual(
      new Date(2025, 10, 2, 18, 30, 0),
    );
  });

  it("falls back to DateTimeDigitized", () => {
    expect(readExifCaptureDate(jpegWithExif("2024:01:05 09:00:00", { tag: 0x9004 }))).toEqual(
      new Date(2024, 0, 5, 9, 0, 0),
    );
  });

  it("is null for a file with no EXIF, a truncated block, or not a JPEG", () => {
    expect(readExifCaptureDate(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer)).toBeNull();
    expect(readExifCaptureDate(jpegWithExif("2025:11:02 18:30:00").slice(0, 40))).toBeNull();
    expect(readExifCaptureDate(new TextEncoder().encode("GIF89a").buffer)).toBeNull();
    expect(readExifCaptureDate(new ArrayBuffer(0))).toBeNull();
  });
});

/**
 * Reads the capture time out of a JPEG's EXIF block (issue #835) so an older
 * photo can pre-fill its date. Only `DateTimeOriginal` (falling back to
 * `DateTimeDigitized`, then `DateTime`) is read; nothing else leaves this
 * function. The upload is re-encoded through a canvas, which drops EXIF.
 *
 * Pure: takes the file's first bytes, returns a local "wall clock" date or null.
 */

const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_TIME = 0x0132;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_DATE_TIME_DIGITIZED = 0x9004;

/** EXIF writes "YYYY:MM:DD HH:MM:SS", in the camera's local time and with no zone. */
export function parseExifDateTime(text: string): Date | null {
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (y < 1990 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d, h, mi, s);
  return Number.isNaN(date.getTime()) || date.getMonth() !== mo - 1 ? null : date;
}

export function readExifCaptureDate(buffer: ArrayBuffer): Date | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

  // Walk the JPEG segments to the APP1 "Exif" one.
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) return null; // image data: no EXIF before it
    const length = view.getUint16(offset + 2);
    if (marker === 0xe1 && length >= 8 && offset + 4 + 6 <= view.byteLength) {
      const isExif =
        view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0x0000;
      if (isExif) {
        const tiff = offset + 10;
        const end = Math.min(view.byteLength, offset + 2 + length);
        return readTiff(view, tiff, end);
      }
    }
    offset += 2 + length;
  }
  return null;
}

function readTiff(view: DataView, tiff: number, end: number): Date | null {
  if (tiff + 8 > end) return null;
  const order = view.getUint16(tiff);
  const little = order === 0x4949;
  if (!little && order !== 0x4d4d) return null;
  if (view.getUint16(tiff + 2, little) !== 0x002a) return null;

  const readAscii = (entry: number): string | null => {
    const count = view.getUint32(entry + 4, little);
    const valueAt = count <= 4 ? entry + 8 : tiff + view.getUint32(entry + 8, little);
    if (valueAt < tiff || valueAt + count > end) return null;
    let text = "";
    for (let i = 0; i < count; i++) {
      const code = view.getUint8(valueAt + i);
      if (code === 0) break;
      text += String.fromCharCode(code);
    }
    return text;
  };

  const readIfd = (ifd: number): Map<number, number> => {
    const entries = new Map<number, number>();
    if (ifd < tiff || ifd + 2 > end) return entries;
    const count = view.getUint16(ifd, little);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > end) break;
      entries.set(view.getUint16(entry, little), entry);
    }
    return entries;
  };

  const ifd0 = readIfd(tiff + view.getUint32(tiff + 4, little));
  const exifPointer = ifd0.get(TAG_EXIF_IFD);
  const exif = exifPointer
    ? readIfd(tiff + view.getUint32(exifPointer + 8, little))
    : new Map<number, number>();

  for (const [tags, source] of [
    [[TAG_DATE_TIME_ORIGINAL, TAG_DATE_TIME_DIGITIZED], exif],
    [[TAG_DATE_TIME], ifd0],
  ] as const) {
    for (const tag of tags) {
      const entry = source.get(tag);
      const text = entry === undefined ? null : readAscii(entry);
      const date = text ? parseExifDateTime(text) : null;
      if (date) return date;
    }
  }
  return null;
}

import { AppleHealthWeightScanner, type ParsedWeightCsv, WorkoutCsvError } from "@jim/core";

/**
 * Streams an Apple Health export into the bodyweight scanner (issue #247).
 * Health's "Export All Health Data" hands over `export.zip`, which holds
 * `apple_health_export/export.xml` next to ECGs and workout routes. The zip
 * is read straight off the file: its directory says where `export.xml`
 * starts, and only that entry is inflated, a chunk at a time, with the
 * browser's own `DecompressionStream`. Nothing is held whole, so a
 * multi-hundred-MB export doesn't freeze or crash the app.
 */

const EOCD = 0x06054b50;
const EOCD64_LOCATOR = 0x07064b50;
const EOCD64 = 0x06064b50;
const CENTRAL_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const MAX_U32 = 0xffffffff;

const NOT_AN_EXPORT =
  "That doesn't look like an Apple Health export. In the Health app, tap your picture → Export All Health Data, then pick the export.zip here.";

interface ZipEntry {
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

async function bytes(blob: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await blob.slice(start, end).arrayBuffer());
}

function u64(view: DataView, offset: number): number {
  return view.getUint32(offset, true) + view.getUint32(offset + 4, true) * 2 ** 32;
}

/** Finds `export.xml` in the zip's central directory. */
async function findExportXml(file: Blob): Promise<ZipEntry> {
  const tailStart = Math.max(0, file.size - (22 + 0xffff));
  const tail = await bytes(file, tailStart, file.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new WorkoutCsvError(NOT_AN_EXPORT);

  let directorySize = tail.getUint32(eocd + 12, true);
  let directoryOffset = tail.getUint32(eocd + 16, true);
  if (
    (directorySize === MAX_U32 || directoryOffset === MAX_U32) &&
    eocd >= 20 &&
    tail.getUint32(eocd - 20, true) === EOCD64_LOCATOR
  ) {
    const record = await bytes(file, u64(tail, eocd - 20 + 8), u64(tail, eocd - 20 + 8) + 56);
    if (record.getUint32(0, true) === EOCD64) {
      directorySize = u64(record, 40);
      directoryOffset = u64(record, 48);
    }
  }

  const directory = await bytes(file, directoryOffset, directoryOffset + directorySize);
  const decoder = new TextDecoder();
  let at = 0;
  while (at + 46 <= directory.byteLength && directory.getUint32(at, true) === CENTRAL_ENTRY) {
    const nameLength = directory.getUint16(at + 28, true);
    const extraLength = directory.getUint16(at + 30, true);
    const commentLength = directory.getUint16(at + 32, true);
    const name = decoder.decode(
      new Uint8Array(directory.buffer, directory.byteOffset + at + 46, nameLength),
    );
    if (name === "export.xml" || name.endsWith("/export.xml")) {
      let compressedSize = directory.getUint32(at + 20, true);
      const uncompressedSize = directory.getUint32(at + 24, true);
      let localHeaderOffset = directory.getUint32(at + 42, true);
      // Zip64: the real sizes sit in extra field 0x0001, in a fixed order,
      // for whichever of them overflowed.
      let extra = at + 46 + nameLength;
      const extraEnd = extra + extraLength;
      while (extra + 4 <= extraEnd) {
        const id = directory.getUint16(extra, true);
        const size = directory.getUint16(extra + 2, true);
        if (id === 0x0001) {
          let field = extra + 4;
          if (uncompressedSize === MAX_U32) field += 8;
          if (compressedSize === MAX_U32) {
            compressedSize = u64(directory, field);
            field += 8;
          }
          if (localHeaderOffset === MAX_U32) localHeaderOffset = u64(directory, field);
        }
        extra += 4 + size;
      }
      return { method: directory.getUint16(at + 10, true), compressedSize, localHeaderOffset };
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  throw new WorkoutCsvError(
    "That zip has no export.xml in it. Pick the export.zip from the Health app's Export All Health Data.",
  );
}

async function exportXmlStream(
  file: Blob,
): Promise<{ stream: ReadableStream<Uint8Array>; size: number }> {
  const entry = await findExportXml(file);
  const header = await bytes(file, entry.localHeaderOffset, entry.localHeaderOffset + 30);
  if (header.getUint32(0, true) !== LOCAL_HEADER) throw new WorkoutCsvError(NOT_AN_EXPORT);
  const dataStart =
    entry.localHeaderOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  const raw = file.slice(dataStart, dataStart + entry.compressedSize).stream();
  if (entry.method === 0) return { stream: raw, size: entry.compressedSize };
  if (entry.method !== 8) {
    throw new WorkoutCsvError("Couldn't unzip that export. Unzip it and pick export.xml instead.");
  }
  if (typeof DecompressionStream === "undefined") {
    throw new WorkoutCsvError(
      "This browser can't unzip the export. Unzip export.zip and pick export.xml from inside it.",
    );
  }
  return {
    stream: raw.pipeThrough(
      new DecompressionStream("deflate-raw") as ReadableWritablePair<Uint8Array, Uint8Array>,
    ),
    size: entry.compressedSize,
  };
}

async function isZip(file: Blob): Promise<boolean> {
  if (file.size < 4) return false;
  return (await bytes(file, 0, 4)).getUint32(0, true) === LOCAL_HEADER;
}

/** Counts bytes as they pass, for a progress bar. */
function counting(onBytes: (count: number) => void): TransformStream<Uint8Array, Uint8Array> {
  let total = 0;
  return new TransformStream({
    transform(chunk, controller) {
      total += chunk.byteLength;
      onBytes(total);
      controller.enqueue(chunk);
    },
  });
}

/** How long to scan before handing the main thread back for a frame. */
const SLICE_MS = 12;

export async function readAppleHealthWeights(
  file: Blob,
  onProgress?: (fraction: number) => void,
): Promise<ParsedWeightCsv> {
  let source: ReadableStream<Uint8Array>;
  let size: number;
  if (await isZip(file)) {
    ({ stream: source, size } = await exportXmlStream(file));
  } else {
    source = file.stream();
    size = file.size;
  }

  // Progress follows the bytes read off the file, so it's exact for a zip too.
  let read = 0;
  const text = source
    .pipeThrough(
      counting((count) => {
        read = count;
      }),
    )
    .pipeThrough(new TextDecoderStream() as ReadableWritablePair<string, Uint8Array>);
  const scanner = new AppleHealthWeightScanner();
  const reader = text.getReader();
  let sliceStart = Date.now();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      scanner.push(value);
      if (Date.now() - sliceStart > SLICE_MS) {
        onProgress?.(size > 0 ? Math.min(read / size, 1) : 0);
        await new Promise((resolve) => setTimeout(resolve, 0));
        sliceStart = Date.now();
      }
    }
  } catch (caught) {
    if (caught instanceof WorkoutCsvError) throw caught;
    throw new WorkoutCsvError(
      "Couldn't read that export. Try exporting from the Health app again.",
    );
  } finally {
    reader.releaseLock();
  }
  onProgress?.(1);
  return scanner.finish();
}

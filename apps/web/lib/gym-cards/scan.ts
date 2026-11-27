import {
  DETECTOR_FORMAT_NAMES,
  type ScannedCode,
  ZXING_FORMAT_NAMES,
  scannedCode,
} from "@jim/core";

/**
 * Reads a gym card's code from a camera frame or a photo (issue #878). Uses
 * the browser's own BarcodeDetector where it has one (Chrome on Android) and
 * zxing-wasm (MIT) everywhere else, which today means every iPhone: WebKit
 * ships BarcodeDetector switched off.
 *
 * The zxing WASM binary is served from /vendor, never a CDN, so scanning
 * needs nothing but this origin. It's copied from the pinned package; a test
 * fails if the two drift apart.
 */

export const ZXING_WASM_URL = "/vendor/zxing_reader-3.1.8.wasm";

export type CodeReader = (image: ImageData) => Promise<ScannedCode | null>;

interface DetectedBarcode {
  format: string;
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(image: ImageData): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorClass {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

async function nativeReader(): Promise<CodeReader | null> {
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const supported = new Set(await Detector.getSupportedFormats());
    const formats = DETECTOR_FORMAT_NAMES.filter((name) => supported.has(name));
    // Android's detector reads them all; one missing most of ours isn't worth using.
    if (formats.length < DETECTOR_FORMAT_NAMES.length - 2) return null;
    const detector = new Detector({ formats });
    return async (image) => {
      for (const found of await detector.detect(image)) {
        const code = scannedCode("detector", found.format, found.rawValue);
        if (code) return code;
      }
      return null;
    };
  } catch {
    return null;
  }
}

async function zxingReader(): Promise<CodeReader> {
  const zxing = await import("zxing-wasm/reader");
  zxing.prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith(".wasm") ? ZXING_WASM_URL : `${prefix}${path}`,
    },
  });
  return async (image) => {
    const results = await zxing.readBarcodes(image, {
      formats: [...ZXING_FORMAT_NAMES],
      tryHarder: true,
      maxNumberOfSymbols: 1,
    });
    for (const result of results) {
      if (!result.isValid) continue;
      const code = scannedCode("zxing", result.format, result.text);
      if (code) return code;
    }
    return null;
  };
}

let reader: Promise<CodeReader> | null = null;

/** The reader for this browser, loaded once. */
export function codeReader(): Promise<CodeReader> {
  reader ??= nativeReader().then((native) => native ?? zxingReader());
  reader.catch(() => {
    reader = null;
  });
  return reader;
}

/** A photo or screenshot's pixels, scaled down to at most `max` on its long side. */
export async function imageDataFromFile(file: Blob, max = 2000): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("no canvas");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return context.getImageData(0, 0, width, height);
}

/**
 * A few colors to offer for the card, sampled from the middle of an image:
 * the most common saturated hues, darkened enough for white text.
 */
export function sampleCardColors(image: ImageData, count = 3): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const { data, width, height } = image;
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 4000)));
  for (let y = Math.floor(height * 0.15); y < height * 0.85; y += step) {
    for (let x = Math.floor(width * 0.1); x < width * 0.9; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max < 40 || max - min < 50) continue; // too dark or too grey to be the card's color
      const hue = Math.round(hueOf(r, g, b, max, min) / 20);
      const bucket = buckets.get(hue) ?? { n: 0, r: 0, g: 0, b: 0 };
      bucket.n += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      buckets.set(hue, bucket);
    }
  }
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map(({ n, r, g, b }) => cardHex(r / n, g / n, b / n));
}

function hueOf(r: number, g: number, b: number, max: number, min: number): number {
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** The color as hex, darkened until white text on it stays readable. */
function cardHex(r: number, g: number, b: number): string {
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const scale = luminance > 0.45 ? 0.45 / luminance : 1;
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(channel * scale)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

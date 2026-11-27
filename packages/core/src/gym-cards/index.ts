/**
 * Gym cards (issue #878, CONTEXT.md): the membership card or key tag a gym
 * scans at the door, kept in Jim so the phone can show it instead. A card is
 * the code as scanned (its symbology and its exact text), recreated on the
 * phone in the same symbology. The code is a door credential: it's sealed on
 * the server and never shown to friends, admins, the MCP or /v1 (ADR-026).
 */

/** The symbologies Jim can scan and draw again, linear first. */
export const GYM_CARD_FORMATS = [
  "code128",
  "code39",
  "code93",
  "codabar",
  "itf",
  "ean13",
  "ean8",
  "upca",
  "upce",
  "qr",
  "pdf417",
  "datamatrix",
  "aztec",
] as const;

export type GymCardFormat = (typeof GYM_CARD_FORMATS)[number];

export const GYM_CARD_FORMAT_LABELS: Record<GymCardFormat, string> = {
  code128: "Code 128",
  code39: "Code 39",
  code93: "Code 93",
  codabar: "Codabar",
  itf: "ITF",
  ean13: "EAN-13",
  ean8: "EAN-8",
  upca: "UPC-A",
  upce: "UPC-E",
  qr: "QR",
  pdf417: "PDF417",
  datamatrix: "Data Matrix",
  aztec: "Aztec",
};

const MATRIX_FORMATS: ReadonlySet<GymCardFormat> = new Set(["qr", "datamatrix", "aztec"]);

/** Square 2D codes (QR, Data Matrix, Aztec); everything else, PDF417 included, is drawn wide. */
export function isSquareFormat(format: GymCardFormat): boolean {
  return MATRIX_FORMATS.has(format);
}

export function isGymCardFormat(value: unknown): value is GymCardFormat {
  return typeof value === "string" && (GYM_CARD_FORMATS as readonly string[]).includes(value);
}

export const GYM_CARD_NAME_MAX = 60;
/** Longer than any membership code; a PDF417 holds about 1,800 characters. */
export const GYM_CARD_CODE_MAX = 1500;

/** Card colors to pick from; the first is the default. */
export const GYM_CARD_COLORS = [
  "#b3261e",
  "#1f1f1f",
  "#c2410c",
  "#d9a62e",
  "#15803d",
  "#0f766e",
  "#2563eb",
  "#6d28d9",
  "#be185d",
] as const;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/** BarcodeDetector's format names (Shape Detection API) to ours. */
const DETECTOR_FORMATS: Record<string, GymCardFormat> = {
  code_128: "code128",
  code_39: "code39",
  code_93: "code93",
  codabar: "codabar",
  itf: "itf",
  ean_13: "ean13",
  ean_8: "ean8",
  upc_a: "upca",
  upc_e: "upce",
  qr_code: "qr",
  pdf417: "pdf417",
  data_matrix: "datamatrix",
  aztec: "aztec",
};

/** The BarcodeDetector formats to ask for. */
export const DETECTOR_FORMAT_NAMES = Object.keys(DETECTOR_FORMATS);

/** zxing-wasm's format names to ours. */
const ZXING_FORMATS: Record<string, GymCardFormat> = {
  Code128: "code128",
  Code39: "code39",
  Code39Std: "code39",
  Code39Ext: "code39",
  Code93: "code93",
  Codabar: "codabar",
  ITF: "itf",
  ITF14: "itf",
  EAN13: "ean13",
  EAN8: "ean8",
  UPCA: "upca",
  UPCE: "upce",
  QRCode: "qr",
  QRCodeModel2: "qr",
  PDF417: "pdf417",
  CompactPDF417: "pdf417",
  DataMatrix: "datamatrix",
  Aztec: "aztec",
  AztecCode: "aztec",
};

/** The zxing-wasm formats to ask for. */
export const ZXING_FORMAT_NAMES = [
  "Code128",
  "Code39",
  "Code93",
  "Codabar",
  "ITF",
  "EAN13",
  "EAN8",
  "UPCA",
  "UPCE",
  "QRCode",
  "PDF417",
  "DataMatrix",
  "Aztec",
] as const;

export interface ScannedCode {
  format: GymCardFormat;
  code: string;
}

/**
 * A scanner's result as a card's format and code, or null when the format
 * isn't one Jim keeps. An EAN-13 starting with 0 is a UPC-A: the bars are the
 * same, and the card prints the 12 digits.
 */
export function scannedCode(
  scanner: "detector" | "zxing",
  formatName: string,
  text: string,
): ScannedCode | null {
  const format = (scanner === "detector" ? DETECTOR_FORMATS : ZXING_FORMATS)[formatName];
  if (!format) return null;
  const code = text.replace(/[\r\n]+$/, "");
  if (code === "") return null;
  if (format === "ean13" && /^0\d{12}$/.test(code)) return { format: "upca", code: code.slice(1) };
  return { format, code };
}

const DIGITS = /^\d+$/;
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;
const LATIN1 = /^[\x20-\x7e\xa0-\xff]+$/;
const CODABAR = /^[A-D][0-9\-$:/.+]+[A-D]$/;

/** The GS1 check digit for the digits before it (EAN, UPC, ITF-14). */
export function gs1CheckDigit(digits: string): number {
  let sum = 0;
  // From the right, the data digits weigh 3, 1, 3, 1…
  for (let fromRight = 0; fromRight < digits.length; fromRight += 1) {
    const digit = Number(digits[digits.length - 1 - fromRight]);
    sum += digit * (fromRight % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

function checkRetail(code: string, lengths: readonly number[], label: string): string | null {
  if (!DIGITS.test(code) || !lengths.includes(code.length)) {
    return `${label} is ${lengths.join(" or ")} digits`;
  }
  // The longer length carries its check digit; the shorter one gets it added when drawn.
  const full = Math.max(...lengths);
  if (code.length === full && gs1CheckDigit(code.slice(0, -1)) !== Number(code.at(-1))) {
    return "That number's last digit doesn't check out";
  }
  return null;
}

/**
 * Tidies a typed or scanned code for its format: trims it, uppercases Code 39
 * when that's all it needs, and gives a Codabar without start and stop
 * letters the usual A…B. Scanned codes pass through unchanged otherwise.
 */
export function cleanGymCardCode(format: GymCardFormat, raw: string): string {
  let code = raw.replace(/^\s+|\s+$/g, "");
  if (format === "code39" && !/^[0-9A-Z \-.$/+%]+$/.test(code)) {
    const upper = code.toUpperCase();
    if (/^[0-9A-Z \-.$/+%]+$/.test(upper)) code = upper;
  }
  if (format === "codabar") {
    code = code.toUpperCase();
    if (/^[0-9\-$:/.+]+$/.test(code)) code = `A${code}B`;
  }
  return code;
}

/** Why a code can't be drawn in its format, or null when it can. */
export function gymCardCodeError(format: GymCardFormat, code: string): string | null {
  if (code === "") return "Enter the number on the card";
  if (code.length > GYM_CARD_CODE_MAX) return "That code is too long";
  switch (format) {
    case "ean13":
      return checkRetail(code, [12, 13], "EAN-13");
    case "ean8":
      return checkRetail(code, [7, 8], "EAN-8");
    case "upca":
      return checkRetail(code, [11, 12], "UPC-A");
    case "upce":
      return DIGITS.test(code) && code.length >= 6 && code.length <= 8
        ? null
        : "UPC-E is 6 to 8 digits";
    case "itf":
      return DIGITS.test(code) && code.length % 2 === 0 ? null : "ITF is an even number of digits";
    case "codabar":
      return CODABAR.test(code) ? null : "Codabar is digits and - $ : / . +";
    case "code39":
    case "code93":
      return PRINTABLE_ASCII.test(code) ? null : "Use letters, digits and common symbols";
    case "code128":
      return LATIN1.test(code) ? null : "Use letters, digits and common symbols";
    default:
      return null;
  }
}

/** Up to two letters for a card's badge: the first letters of its first two words. */
export function gymCardMonogram(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word));
  const letters = words
    .slice(0, 2)
    .map((word) => [...word.replace(/[^\p{L}\p{N}]/gu, "")][0] ?? "")
    .join("");
  return letters.toLocaleUpperCase() || "?";
}

/** The fields of a synced card row the helpers read; Dexie and Drizzle rows both fit. */
export interface GymCardSource {
  position: number;
  createdAt: Date;
  deletedAt: Date | null;
}

/** Live cards in their order, then oldest first. */
export function sortGymCards<T extends GymCardSource>(rows: readonly T[]): T[] {
  return rows
    .filter((row) => !row.deletedAt)
    .sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime());
}

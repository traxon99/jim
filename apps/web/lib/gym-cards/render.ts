import type { GymCardRow, JimDatabase } from "@/lib/db/schema";
import { type GymCardFormat, isSquareFormat } from "@jim/core";

/**
 * Draws a gym card's code again in its own symbology (issue #878), as SVG,
 * with bwip-js (MIT). The encoder is loaded only when a card is drawn, and
 * the SVG is kept in Dexie (`gymCardArt`), so showing a card at the door is
 * just painting stored markup: no encoder, network or camera. The service
 * worker precaches every `_next/static` chunk, so a card synced from another
 * phone can still be drawn offline.
 *
 * Bars are black on white with a white quiet zone; the card's number is
 * printed by the app under the code, not by bwip-js.
 */

const CODE39_SET = /^[0-9A-Z \-.$/+%]+$/;

/** What a drawing depends on; a stored drawing with another key is stale. */
export function gymCardArtKey(format: GymCardFormat, code: string): string {
  return `v1|${format}|${code}`;
}

export async function drawGymCardSvg(format: GymCardFormat, code: string): Promise<string> {
  const bwip = await import("bwip-js/browser");
  const draw = bwip.drawingSVG();
  const common = { text: code, backgroundcolor: "FFFFFF", includetext: false };
  const linear = { ...common, height: 14, scale: 3, paddingwidth: 12, paddingheight: 4 };
  const square = { ...common, scale: 4, padding: 6 };
  switch (format) {
    case "code128":
      return bwip.code128({ bcid: "code128", ...linear }, draw);
    case "code39":
      return CODE39_SET.test(code)
        ? bwip.code39({ bcid: "code39", ...linear }, draw)
        : bwip.code39ext({ bcid: "code39ext", ...linear }, draw);
    case "code93":
      return CODE39_SET.test(code)
        ? bwip.code93({ bcid: "code93", ...linear }, draw)
        : bwip.code93ext({ bcid: "code93ext", ...linear }, draw);
    case "codabar":
      return bwip.rationalizedCodabar({ bcid: "rationalizedCodabar", ...linear }, draw);
    case "itf":
      return bwip.interleaved2of5({ bcid: "interleaved2of5", ...linear }, draw);
    case "ean13":
      return bwip.ean13({ bcid: "ean13", ...linear }, draw);
    case "ean8":
      return bwip.ean8({ bcid: "ean8", ...linear }, draw);
    case "upca":
      return bwip.upca({ bcid: "upca", ...linear }, draw);
    case "upce":
      return bwip.upce({ bcid: "upce", ...linear }, draw);
    case "pdf417":
      return bwip.pdf417({ bcid: "pdf417", ...common, scale: 2, padding: 6 }, draw);
    case "qr":
      return bwip.qrcode({ bcid: "qrcode", ...square }, draw); // error correction M, bwip-js's default
    case "datamatrix":
      return bwip.datamatrix({ bcid: "datamatrix", ...square }, draw);
    case "aztec":
      return bwip.azteccode({ bcid: "azteccode", ...square }, draw);
  }
}

/**
 * The card's stored drawing, drawn and stored first when it's missing or
 * stale. Throws when bwip-js can't draw the code.
 */
export async function gymCardSvg(
  card: Pick<GymCardRow, "id" | "format" | "code">,
  database: JimDatabase,
): Promise<string> {
  const format = card.format as GymCardFormat;
  const key = gymCardArtKey(format, card.code);
  const stored = await database.gymCardArt.get(card.id);
  if (stored?.key === key) return stored.svg;
  const svg = await drawGymCardSvg(format, card.code);
  await database.gymCardArt.put({ id: card.id, key, svg });
  return svg;
}

/** Whether the drawing should fill the width (linear, PDF417) or sit square. */
export function gymCardShape(format: string): "square" | "wide" {
  return isSquareFormat(format as GymCardFormat) ? "square" : "wide";
}

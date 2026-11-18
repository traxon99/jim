import { PHOTO_JPEG_QUALITY, PHOTO_ORIGINAL_LONG_EDGE, PHOTO_THUMB_LONG_EDGE } from "@jim/core";
import { readExifCaptureDate } from "./exif";

/** `width × height` scaled down so the long edge is at most `longEdge`; never scaled up. */
export function fitWithin(
  width: number,
  height: number,
  longEdge: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= longEdge) return { width, height };
  const scale = longEdge / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface ProcessedPhoto {
  original: Blob;
  thumb: Blob;
  /** The original's size in pixels, after the camera's rotation is applied. */
  width: number;
  height: number;
  /** When the photo was taken, from its EXIF block, read before the block is dropped. */
  capturedAt: Date | null;
}

async function encode(bitmap: ImageBitmap, size: { width: number; height: number }): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't process photos");
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", PHOTO_JPEG_QUALITY),
  );
  // Release the canvas's pixels now rather than at the next GC.
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error("Couldn't process that photo");
  return blob;
}

/**
 * Decodes a picked photo and re-encodes it through a canvas: that drops every
 * EXIF block (location, camera) from what's uploaded. The capture date is read
 * first, to pre-fill the day. Makes a 2048 px original and a 400 px thumbnail.
 */
export async function processPhotoFile(file: Blob): Promise<ProcessedPhoto> {
  const capturedAt = readExifCaptureDate(await file.slice(0, 256 * 1024).arrayBuffer());
  // "from-image" applies the camera's rotation, so a portrait shot isn't sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const original = fitWithin(bitmap.width, bitmap.height, PHOTO_ORIGINAL_LONG_EDGE);
    const thumb = fitWithin(bitmap.width, bitmap.height, PHOTO_THUMB_LONG_EDGE);
    return {
      original: await encode(bitmap, original),
      thumb: await encode(bitmap, thumb),
      width: original.width,
      height: original.height,
      capturedAt,
    };
  } finally {
    bitmap.close();
  }
}

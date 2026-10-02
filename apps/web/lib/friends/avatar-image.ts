import { AVATAR_MAX_LENGTH, AVATAR_SIZE } from "@jim/core";

/**
 * The centered square to crop out of a `width` × `height` image: the whole of
 * its shorter side, so a portrait photo loses its top and bottom equally.
 */
export function centerSquare(width: number, height: number) {
  const size = Math.min(width, height);
  return { x: (width - size) / 2, y: (height - size) / 2, size };
}

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Turns a picked photo into a profile picture (issue #316): cropped to its
 * centered square and scaled to AVATAR_SIZE px, as a JPEG data URL small
 * enough to store on the user's row. Throws if the file can't be read as an
 * image.
 */
export async function photoToAvatar(file: Blob): Promise<string> {
  const image = await loadImage(file);
  const { x, y, size } = centerSquare(image.naturalWidth, image.naturalHeight);
  if (size === 0) throw new Error("Empty image");
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, x, y, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  // Step the quality down on the rare photo that's still too big.
  for (const quality of [0.85, 0.7, 0.5]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= AVATAR_MAX_LENGTH) return dataUrl;
  }
  throw new Error("Image too large");
}

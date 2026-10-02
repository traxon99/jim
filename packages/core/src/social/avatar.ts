/**
 * Profile pictures (issue #316) are stored inline on the user's row as a
 * small square image data URL: the phone crops and shrinks the photo to
 * AVATAR_SIZE px before uploading, so there's no file storage to run.
 */

/** The width and height, in px, a picked photo is cropped and scaled to. */
export const AVATAR_SIZE = 256;

/** The longest data URL accepted, ~110 KB of image: a 256 px JPEG is well under. */
export const AVATAR_MAX_LENGTH = 150_000;

const AVATAR_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Whether `value` is an image data URL small enough to store as an avatar. */
export function isValidAvatar(value: unknown): value is string {
  return (
    typeof value === "string" && value.length <= AVATAR_MAX_LENGTH && AVATAR_PATTERN.test(value)
  );
}

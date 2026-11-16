const SUPABASE_SVG_PREFIX = "data:image/svg+xml;utf-8,";

/**
 * Supabase returns a TOTP QR code as `data:image/svg+xml;utf-8,<svg …>`:
 * raw markup under a parameter browsers don't recognise, which Chromium
 * shows as a broken image. Re-issue it as a well-formed, encoded data URL.
 */
export function qrCodeSrc(qrCode: string): string {
  if (!qrCode.startsWith(SUPABASE_SVG_PREFIX)) return qrCode;
  const payload = qrCode.slice(SUPABASE_SVG_PREFIX.length);
  const markup = payload.trimStart().startsWith("<") ? payload : decodeURIComponent(payload);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

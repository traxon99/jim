/**
 * Chrome fires `beforeinstallprompt` once per page load, and it can land
 * before React hydrates and the install gate starts listening (#676). This
 * inline <head> script catches it early and parks it on `window`.
 */
const EARLY_PROMPT_KEY = "__jimInstallPrompt";

export const INSTALL_PROMPT_SCRIPT = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window[${JSON.stringify(
  EARLY_PROMPT_KEY,
)}]=e});`;

/** The event the head script caught, if any, cleared once taken. */
export function takeEarlyInstallPrompt(
  target: Record<string, unknown> = globalThis as unknown as Record<string, unknown>,
): Event | null {
  const event = target[EARLY_PROMPT_KEY];
  delete target[EARLY_PROMPT_KEY];
  return event instanceof Event ? event : null;
}

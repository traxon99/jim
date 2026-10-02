/**
 * A cold open is the first page load of a browsing session: the app was
 * closed (or never opened) and is starting from nothing. Reloads inside the
 * same session (a service worker update, a manual refresh) are warm. iOS
 * clears sessionStorage when a PWA is closed from the app switcher, while
 * resuming a suspended app doesn't reload the page at all (docs/PWA.md §8).
 *
 * This runs as an inline <head> script, before first paint, so the splash
 * can pick its cold or warm look in CSS without a flash. It sets
 * `data-boot="cold" | "warm"` on <html>. Kept as a string so the layout can
 * inline it, and exported as a function too so it can be unit-tested.
 */
export const BOOT_SESSION_KEY = "jim:booted";

export function markBoot(storage: Pick<Storage, "getItem" | "setItem"> | null): "cold" | "warm" {
  let kind: "cold" | "warm" = "cold";
  try {
    if (storage?.getItem(BOOT_SESSION_KEY)) kind = "warm";
    storage?.setItem(BOOT_SESSION_KEY, "1");
  } catch {
    // Storage blocked (private mode, quota): treat every load as cold.
  }
  return kind;
}

export const COLD_OPEN_SCRIPT = `(function(){var k="cold";try{if(sessionStorage.getItem(${JSON.stringify(
  BOOT_SESSION_KEY,
)}))k="warm";sessionStorage.setItem(${JSON.stringify(BOOT_SESSION_KEY)},"1")}catch(e){}document.documentElement.setAttribute("data-boot",k)})();`;

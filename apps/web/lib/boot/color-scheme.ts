/**
 * The color scheme setting lives in Dexie, which loads after first paint, so
 * a phone in light mode with Jim set to Dark drew the splash white and then
 * flipped to black on every open (#669). ColorSchemeEffect copies the setting
 * here, and this inline <head> script applies `.dark` from it before first
 * paint. With nothing stored yet it follows the system, as before.
 */
export const COLOR_SCHEME_KEY = "jim:color-scheme";

export type StoredColorScheme = "light" | "dark" | "system";

export function prefersDark(stored: string | null, systemDark: boolean): boolean {
  if (stored === "dark") return true;
  if (stored === "light") return false;
  return systemDark;
}

export function storeColorScheme(
  scheme: StoredColorScheme,
  storage: Pick<Storage, "setItem"> | null = globalThis.localStorage ?? null,
): void {
  try {
    storage?.setItem(COLOR_SCHEME_KEY, scheme);
  } catch {
    // Storage blocked: the next open follows the system until Dexie loads.
  }
}

export const COLOR_SCHEME_SCRIPT = `(function(){var s=null;try{s=localStorage.getItem(${JSON.stringify(
  COLOR_SCHEME_KEY,
)})}catch(e){}var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")})();`;

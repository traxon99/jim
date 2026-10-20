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

/** globals.css --background in each theme: what the status bar should match. */
export const THEME_COLORS = { light: "#ffffff", dark: "#0a0a0a" } as const;

/**
 * Points every theme-color meta at the app's theme, not the system's: the
 * layout's light/dark pair only knows `prefers-color-scheme`, so an Android
 * phone in light mode with Jim set to Dark got a white status bar (#681).
 */
export function applyThemeColor(dark: boolean, doc: Pick<Document, "querySelectorAll"> = document) {
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", dark ? THEME_COLORS.dark : THEME_COLORS.light);
  }
}

export const COLOR_SCHEME_SCRIPT = `(function(){var s=null;try{s=localStorage.getItem(${JSON.stringify(
  COLOR_SCHEME_KEY,
)})}catch(e){}var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");try{document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",d?${JSON.stringify(
  THEME_COLORS.dark,
)}:${JSON.stringify(THEME_COLORS.light)})})}catch(e){}})();`;

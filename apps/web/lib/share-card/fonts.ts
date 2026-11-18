// The card font, embedded as data (issue #838). A canvas draws an SVG as an
// image, and an SVG image can't load the page's web fonts, so the font has
// to travel inside the SVG. The app already has Roboto (next/font) loaded and
// cached for offline use; this finds its file through the page's own
// stylesheet, so sharing works offline and no second copy ships.

let cached: Promise<string> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** The url() of the app's Roboto `@font-face`, or null when the page doesn't have one. */
function findRobotoUrl(): string | null {
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style.getPropertyValue("font-family");
      if (!/roboto/i.test(family) || /fallback/i.test(family)) continue;
      const match = /url\(["']?([^"')]+)["']?\)/.exec(rule.style.getPropertyValue("src"));
      if (match?.[1]) return new URL(match[1], sheet.href ?? document.baseURI).href;
    }
  }
  return null;
}

async function loadFontCss(): Promise<string> {
  try {
    const url = findRobotoUrl();
    if (!url) return "";
    const response = await fetch(url);
    if (!response.ok) return "";
    const data = arrayBufferToBase64(await response.arrayBuffer());
    return `@font-face{font-family:"JimCard";font-weight:100 900;font-style:normal;src:url(data:font/woff2;base64,${data}) format("woff2");}`;
  } catch {
    // Offline with the font not cached, or blocked: the card falls back to the system font.
    return "";
  }
}

/** `@font-face` CSS for the card, loaded once; empty when the font can't be found. */
export function cardFontCss(): Promise<string> {
  if (!cached) {
    cached = loadFontCss().then((css) => {
      // Don't remember a miss: the font may simply not be in the cache yet.
      if (!css) cached = null;
      return css;
    });
  }
  return cached;
}

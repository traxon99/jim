// SVG text doesn't wrap or shrink, and a canvas can't measure a font that
// hasn't loaded, so the cards fit text by character count: an average glyph
// is about 0.52 em wide in the card font. Good enough to keep a long name
// inside its box; the last step is always an ellipsis.

const GLYPH_EM = 0.52;

/** `text` cut to `maxChars`, ending in an ellipsis when it was longer. */
export function truncate(text: string, maxChars: number): string {
  const chars = [...text];
  if (chars.length <= maxChars) return text;
  return `${chars
    .slice(0, Math.max(1, maxChars - 1))
    .join("")
    .trimEnd()}…`;
}

/** The largest of `sizes` at which `text` fits `maxWidth`, else the smallest. */
export function fitFontSize(text: string, maxWidth: number, sizes: readonly number[]): number {
  const length = [...text].length;
  for (const size of sizes) {
    if (length * size * GLYPH_EM <= maxWidth) return size;
  }
  return sizes.at(-1) ?? 16;
}

/** Characters of `fontSize` text that fit `maxWidth`. */
export function charsThatFit(maxWidth: number, fontSize: number): number {
  return Math.max(1, Math.floor(maxWidth / (fontSize * GLYPH_EM)));
}

/** `text` wrapped at word boundaries to at most `maxLines`, the last line truncated. */
export function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if ([...next].length <= maxChars || current === "") {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines.map((line) => truncate(line, maxChars));
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = truncate(
    `${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`,
    maxChars,
  );
  return kept;
}

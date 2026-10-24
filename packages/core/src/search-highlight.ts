/**
 * Which parts of a search result to highlight for a query (issue #709).
 * Matching mirrors the search itself loosely: case, punctuation and spacing
 * are ignored ("push up" lights up "Push-Up"), the whole phrase is tried
 * first, then each word on its own. Typo-tolerant matches ("sqaut") find
 * the row but highlight nothing — better no mark than a wrong one.
 */
export interface HighlightPart {
  text: string;
  match: boolean;
}

/** Words this short only match at a word start, so "a" doesn't mark every a. */
const SUBSTRING_MIN_LENGTH = 3;

export function highlightMatches(text: string, query: string): HighlightPart[] {
  const ranges = matchRanges(text, query);
  if (ranges.length === 0) return text ? [{ text, match: false }] : [];
  const parts: HighlightPart[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), match: false });
    parts.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
}

/** Sorted, non-overlapping [start, end) ranges of `text` that match `query`. */
function matchRanges(text: string, query: string): [number, number][] {
  const needle = normalizeQuery(query);
  if (!needle) return [];
  const { normalized, origin } = normalizeWithOrigin(text);

  let found = occurrences(normalized, needle, needle.length < SUBSTRING_MIN_LENGTH);
  if (found.length === 0 && needle.includes(" ")) {
    found = needle
      .split(" ")
      .flatMap((word) => occurrences(normalized, word, word.length < SUBSTRING_MIN_LENGTH));
  }
  if (found.length === 0) return [];

  const ranges = found
    .map(([start, end]): [number, number] => [
      origin[start] as number,
      (origin[end - 1] as number) + 1,
    ])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push(range);
  }
  return merged;
}

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * `text` lowercased with each run of punctuation/whitespace collapsed to one
 * space, plus where each of its characters came from in `text`.
 */
function normalizeWithOrigin(text: string): { normalized: string; origin: number[] } {
  let normalized = "";
  const origin: number[] = [];
  for (let index = 0; index < text.length; index++) {
    const char = (text[index] as string).toLowerCase();
    if (/[a-z0-9]/.test(char)) {
      normalized += char;
      origin.push(index);
    } else if (normalized && !normalized.endsWith(" ")) {
      normalized += " ";
      origin.push(index);
    }
  }
  if (normalized.endsWith(" ")) {
    normalized = normalized.slice(0, -1);
    origin.pop();
  }
  return { normalized, origin };
}

function occurrences(haystack: string, needle: string, wordStartOnly: boolean): [number, number][] {
  if (!needle) return [];
  const found: [number, number][] = [];
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    if (!wordStartOnly || at === 0 || haystack[at - 1] === " ") {
      found.push([at, at + needle.length]);
      from = at + needle.length;
    } else {
      from = at + 1;
    }
  }
  return found;
}

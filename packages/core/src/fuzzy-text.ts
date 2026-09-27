/**
 * The typo-, spacing- and abbreviation-tolerant text matching behind
 * exercise search (issue #130), shared with routine search (issue #219).
 * Deliberately not re-exported from the package index — callers go through
 * searchExercises/searchRoutines, which own their own ranking weights.
 */

/**
 * Gym shorthand users type in place of the catalog's single full word.
 * Multi-word ones (OHP, RDL) are left to the curated aliases — expanding
 * "ohp" to "overhead" *or* "press" would match every press.
 */
const ABBREVIATIONS: Record<string, readonly string[]> = {
  db: ["dumbbell"],
  bb: ["barbell"],
  kb: ["kettlebell"],
  bw: ["bodyweight"],
  dl: ["deadlift"],
};

/** Lowercase, with every run of punctuation/whitespace collapsed to one space. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function words(normalized: string): string[] {
  return normalized ? normalized.split(" ") : [];
}

/** Crude plural folding, enough for "ups"/"up", "curls"/"curl" — not "press". */
function singular(word: string): string {
  return word.length > 2 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

/**
 * Optimal-string-alignment distance (Levenshtein plus adjacent
 * transpositions, so "sqaut" is one edit from "squat"), giving up once it
 * exceeds `max`.
 */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        (prev[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (prevPrev[j - 2] as number) + 1);
      }
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = current;
  }
  return prev[b.length] as number;
}

/** Typos tolerated for a query word of this length — none for short words. */
function allowedTypos(length: number): number {
  if (length <= 3) return 0;
  return length <= 6 ? 1 : 2;
}

/**
 * How well one query word matches one field word: 1 for the same word, 0.8
 * for a prefix ("inc" → "incline"), 0.5 within typo distance, else 0.
 */
function wordQuality(queryWord: string, fieldWord: string): number {
  const q = singular(queryWord);
  const w = singular(fieldWord);
  if (q === w) return 1;
  if (fieldWord.startsWith(queryWord)) return 0.8;
  const typos = allowedTypos(q.length);
  if (typos > 0) {
    if (editDistance(q, w, typos) <= typos) return 0.5;
    // A misspelt prefix: "benc" typed as "bnec".
    if (w.length > q.length && editDistance(q, w.slice(0, q.length), typos) <= typos) return 0.4;
  }
  return 0;
}

/**
 * Every query word must match some field word (via itself or one of its
 * abbreviation expansions); the result is the weakest word's quality, so
 * one typo caps the whole match at the typo tier. 0 if any word misses.
 */
export function tokenQuality(queryWords: readonly string[], fieldWords: readonly string[]): number {
  if (queryWords.length === 0 || fieldWords.length === 0) return 0;
  let weakest = 1;
  for (const queryWord of queryWords) {
    const candidates = [queryWord, ...(ABBREVIATIONS[queryWord] ?? [])];
    let best = 0;
    for (const candidate of candidates) {
      for (const fieldWord of fieldWords) {
        best = Math.max(best, wordQuality(candidate, fieldWord));
        if (best === 1) break;
      }
      if (best === 1) break;
    }
    if (best === 0) return 0;
    weakest = Math.min(weakest, best);
  }
  return weakest;
}

function isWholeWordMatch(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

export function scoreField(
  value: string,
  query: string,
  weights: { exact: number; startsWith: number; wholeWord: number; substring: number },
): number {
  if (value === query) return weights.exact;
  if (value.startsWith(query)) return weights.startsWith;
  if (isWholeWordMatch(value, query)) return weights.wholeWord;
  if (value.includes(query)) return weights.substring;
  return 0;
}

/** The fuzzy fallback for one field, when it has no whole-phrase match. */
export function scoreFieldTokens(
  value: string,
  query: string,
  queryWords: readonly string[],
  weights: { compact: number; tokens: number },
): number {
  const compactQuery = query.replace(/ /g, "");
  if (compactQuery.length >= 3 && value.replace(/ /g, "").includes(compactQuery)) {
    return weights.compact;
  }
  return weights.tokens * tokenQuality(queryWords, words(value));
}

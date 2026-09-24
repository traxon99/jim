import type { CatalogExercise } from "./types";

/**
 * A hand-curated exact alias (see packages/db's seed/aliases.ts) outranks a
 * bare name prefix on purpose: free-exercise-db has 47 exercises with
 * "bench" in the name, several literally named "Bench Press - <something>",
 * so a naive prefix match can't tell "the" barbell bench press apart from
 * "Bench Press - Powerlifting" or "Bench Dips". The curated alias is what
 * actually encodes which variant is canonical.
 */
const WEIGHTS = {
  exactName: 100,
  exactAlias: 90,
  nameStartsWith: 70,
  aliasStartsWith: 65,
  nameWholeWord: 50,
  aliasWholeWord: 45,
  nameSubstring: 20,
  aliasSubstring: 15,
} as const;

/**
 * Below every whole-phrase tier: matches where the query's words are all
 * present but not as one contiguous phrase ("incline db press" → "Incline
 * Dumbbell Bench Press"), spacing/hyphens differ ("pushup" → "Push-Up"), or
 * a word is misspelt ("sqaut" → "Squat") — issue #130. Equipment and
 * muscles are the last resort, so "chest dumbbell" still finds something.
 */
const TOKEN_WEIGHTS = {
  nameCompact: 18,
  nameTokens: 16,
  aliasCompact: 14,
  aliasTokens: 12,
  metadataTokens: 6,
} as const;

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
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(normalized: string): string[] {
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
function tokenQuality(queryWords: readonly string[], fieldWords: readonly string[]): number {
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

function scoreField(
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
function scoreFieldTokens(
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

interface Normalized {
  name: string;
  aliases: string[];
  metadataWords: string[];
}

function scoreExercise(exercise: Normalized, query: string, queryWords: readonly string[]): number {
  const nameScore = scoreField(exercise.name, query, {
    exact: WEIGHTS.exactName,
    startsWith: WEIGHTS.nameStartsWith,
    wholeWord: WEIGHTS.nameWholeWord,
    substring: WEIGHTS.nameSubstring,
  });

  let aliasScore = 0;
  for (const alias of exercise.aliases) {
    aliasScore = Math.max(
      aliasScore,
      scoreField(alias, query, {
        exact: WEIGHTS.exactAlias,
        startsWith: WEIGHTS.aliasStartsWith,
        wholeWord: WEIGHTS.aliasWholeWord,
        substring: WEIGHTS.aliasSubstring,
      }),
    );
  }

  const phraseScore = Math.max(nameScore, aliasScore);
  if (phraseScore > 0) return phraseScore;

  let tokenScore = scoreFieldTokens(exercise.name, query, queryWords, {
    compact: TOKEN_WEIGHTS.nameCompact,
    tokens: TOKEN_WEIGHTS.nameTokens,
  });
  for (const alias of exercise.aliases) {
    tokenScore = Math.max(
      tokenScore,
      scoreFieldTokens(alias, query, queryWords, {
        compact: TOKEN_WEIGHTS.aliasCompact,
        tokens: TOKEN_WEIGHTS.aliasTokens,
      }),
    );
  }
  if (tokenScore > 0) return tokenScore;

  const allWords = [...words(exercise.name), ...exercise.metadataWords];
  return TOKEN_WEIGHTS.metadataTokens * tokenQuality(queryWords, allWords);
}

function normalizeExercise(exercise: CatalogExercise): Normalized {
  return {
    name: normalize(exercise.name),
    aliases: exercise.aliases.map(normalize),
    metadataWords: words(
      normalize(
        [exercise.equipment ?? "", ...exercise.primaryMuscles, ...exercise.secondaryMuscles].join(
          " ",
        ),
      ),
    ),
  };
}

/**
 * Ranked fuzzy search over name + aliases (and, as a last resort, equipment
 * and muscles). Whole-phrase matches always outrank word-by-word, spacing-
 * insensitive and typo-tolerant ones. No match (score 0) is dropped rather
 * than kept at the bottom — an empty query returns every exercise
 * unranked, in its given order.
 */
export function searchExercises<T extends CatalogExercise>(
  exercises: readonly T[],
  query: string,
): T[] {
  const normalized = normalize(query);
  if (!normalized) return [...exercises];
  const queryWords = words(normalized);

  return exercises
    .map((exercise) => ({
      exercise,
      score: scoreExercise(normalizeExercise(exercise), normalized, queryWords),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name))
    .map(({ exercise }) => exercise);
}

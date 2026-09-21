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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isWholeWordMatch(haystack: string, needle: string): boolean {
  return new RegExp(`\\b${escapeRegExp(needle)}\\b`).test(haystack);
}

function scoreField(
  value: string,
  query: string,
  weights: { exact: number; startsWith: number; wholeWord: number; substring: number },
): number {
  const lower = value.toLowerCase();
  if (lower === query) return weights.exact;
  if (lower.startsWith(query)) return weights.startsWith;
  if (isWholeWordMatch(lower, query)) return weights.wholeWord;
  if (lower.includes(query)) return weights.substring;
  return 0;
}

function scoreExercise(exercise: CatalogExercise, query: string): number {
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

  return Math.max(nameScore, aliasScore);
}

/**
 * Ranked fuzzy search over name + aliases. No match (score 0) is dropped
 * rather than kept at the bottom — an empty query returns every exercise
 * unranked, in its given order.
 */
export function searchExercises<T extends CatalogExercise>(
  exercises: readonly T[],
  query: string,
): T[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [...exercises];

  return exercises
    .map((exercise) => ({ exercise, score: scoreExercise(exercise, trimmed) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name))
    .map(({ exercise }) => exercise);
}

import { normalize, scoreField, scoreFieldTokens, tokenQuality, words } from "../fuzzy-text";
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

import { normalize, scoreField, scoreFieldTokens, tokenQuality, words } from "../fuzzy-text";

export interface SearchableRoutine {
  id: string;
  name: string;
  folder: string | null;
  notes: string | null;
}

/**
 * The routine's own name always wins: any name match, down to a word-by-
 * word typo match, outranks a folder, exercise or notes match. Below that,
 * a hit on the folder beats a hit on an exercise in the routine ("bench"
 * → every routine with bench press in it), which beats the free-text notes.
 */
const NAME_WEIGHTS = {
  exact: 100,
  startsWith: 70,
  wholeWord: 50,
  substring: 20,
  compact: 18,
  tokens: 16,
} as const;

const SECONDARY_WEIGHTS = {
  folder: 10,
  exercise: 8,
  notes: 4,
  /**
   * Every query word found across the name and exercises ("leg squat").
   * Folder and notes stay out of it: a shared folder would otherwise pull
   * "Pull Day" into a search for "push day".
   */
  anyField: 2,
} as const;

/**
 * 1 for a whole-phrase hit, else the word-by-word (typo/abbreviation-
 * tolerant) quality — scaled by the field's weight, so every secondary
 * field ranks below any name match.
 */
function fieldQuality(value: string, query: string, queryWords: readonly string[]): number {
  if (!value) return 0;
  if (scoreField(value, query, { exact: 1, startsWith: 1, wholeWord: 1, substring: 1 }) > 0) {
    return 1;
  }
  return tokenQuality(queryWords, words(value));
}

function bestQuality(values: readonly string[], query: string, queryWords: readonly string[]) {
  let best = 0;
  for (const value of values) {
    best = Math.max(best, fieldQuality(value, query, queryWords));
    if (best === 1) break;
  }
  return best;
}

function scoreRoutine(
  routine: SearchableRoutine,
  exerciseNames: readonly string[],
  query: string,
  queryWords: readonly string[],
): number {
  const name = normalize(routine.name);
  const nameScore = scoreField(name, query, NAME_WEIGHTS);
  if (nameScore > 0) return nameScore;
  const nameTokenScore = scoreFieldTokens(name, query, queryWords, NAME_WEIGHTS);
  if (nameTokenScore > 0) return nameTokenScore;

  const folder = normalize(routine.folder ?? "");
  const exercises = exerciseNames.map(normalize);
  const notes = normalize(routine.notes ?? "");

  const secondary = Math.max(
    SECONDARY_WEIGHTS.folder * fieldQuality(folder, query, queryWords),
    SECONDARY_WEIGHTS.exercise * bestQuality(exercises, query, queryWords),
    SECONDARY_WEIGHTS.notes * fieldQuality(notes, query, queryWords),
  );
  if (secondary > 0) return secondary;

  const allWords = [name, ...exercises].flatMap(words);
  return SECONDARY_WEIGHTS.anyField * tokenQuality(queryWords, allWords);
}

/**
 * Ranked fuzzy search over routines (issue #219), using the same typo-,
 * spacing- and abbreviation-tolerant matching as exercise search. Matches
 * the routine's name first, then its folder, the exercises in it
 * (`exerciseNamesByRoutineId`) and its notes. Non-matches are dropped;
 * equal scores keep their given order, so callers can pre-sort by
 * position. An empty query returns every routine in its given order.
 */
export function searchRoutines<T extends SearchableRoutine>(
  routines: readonly T[],
  query: string,
  exerciseNamesByRoutineId: ReadonlyMap<string, readonly string[]> = new Map(),
): T[] {
  const normalized = normalize(query);
  if (!normalized) return [...routines];
  const queryWords = words(normalized);

  return routines
    .map((routine, index) => ({
      routine,
      index,
      score: scoreRoutine(
        routine,
        exerciseNamesByRoutineId.get(routine.id) ?? [],
        normalized,
        queryWords,
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ routine }) => routine);
}

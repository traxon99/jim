/**
 * The controlled vocabulary the seed catalog ships with (ADR-008), sourced
 * from free-exercise-db. Lives here (not packages/db) so client-side UI —
 * the exercise form's muscle picker — can import it without pulling in
 * packages/db's Postgres client code into a browser bundle.
 */
export const MUSCLES = [
  "abdominals",
  "abductors",
  "adductors",
  "biceps",
  "calves",
  "chest",
  "forearms",
  "glutes",
  "hamstrings",
  "lats",
  "lower back",
  "middle back",
  "neck",
  "quadriceps",
  "shoulders",
  "traps",
  "triceps",
] as const;

export type Muscle = (typeof MUSCLES)[number];

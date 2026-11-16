import path from "node:path";
import { readCode } from "@/lib/test/source-scan";
import { describe, expect, it } from "vitest";

// Every list that shows the user's exercises opens the exercise card from the
// name (issue #796). The workout sections, History and the Exercises tab had
// their own links already; these are the lists that didn't.
const webRoot = path.resolve(__dirname, "../..");

const LISTS = [
  "components/routines/routine-detail.tsx",
  "components/routines/routine-exercise-row.tsx",
  "components/workout/pre-workout-sheet.tsx",
  "components/workout/session-summary.tsx",
  "components/dpr/lift-card.tsx",
  "components/dpr/block-recap.tsx",
  "components/programs/program-generator.tsx",
  "components/programs/program-progress.tsx",
];

describe("exercise card reach (#796)", () => {
  it.each(LISTS)("%s opens the exercise card from a listed name", (file) => {
    expect(readCode(path.join(webRoot, file))).toMatch(/<ExerciseNameButton\b/);
  });
});

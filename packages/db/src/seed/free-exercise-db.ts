import { slugify } from "@jim/core";
import type { exercises } from "../schema";
import { EXERCISE_ALIASES } from "./aliases";
import { cardioSeedRows, curatedSeedRows } from "./curated";
import { parseForce, parseLevel, parseMechanic } from "./enum-values";
import { normalizeMuscles } from "./muscles";
import { withTargets } from "./targets";
import { classifyTrackingType } from "./tracking-type";
import { classifyCategory, warmupSeedRows } from "./warmups";

// Pinned to a commit so a change upstream can't alter (or break) a production deploy. To update,
// bump the SHA and review the dataset diff.
const DATASET_COMMIT = "f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5";
const DATASET_URL = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${DATASET_COMMIT}/dist/exercises.json`;
const IMAGE_BASE_URL = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${DATASET_COMMIT}/exercises`;

interface RawExercise {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
}

export type SeedExercise = typeof exercises.$inferInsert;

function normalizeExercise(raw: RawExercise): SeedExercise {
  const slug = slugify(raw.id);
  return {
    ownerId: null,
    slug,
    name: raw.name,
    aliases: [...(EXERCISE_ALIASES[slug] ?? [])],
    primaryMuscles: normalizeMuscles(raw.primaryMuscles),
    secondaryMuscles: normalizeMuscles(raw.secondaryMuscles),
    equipment: raw.equipment,
    mechanic: parseMechanic(raw.mechanic),
    force: parseForce(raw.force),
    level: parseLevel(raw.level),
    trackingType: classifyTrackingType(raw),
    category: classifyCategory(raw),
    instructions: raw.instructions,
    imageUrls: raw.images.map((path) => `${IMAGE_BASE_URL}/${path}`),
  };
}

/** The group tags a seed row had before Jim's muscle tree re-tagged it. */
export interface RetaggedSeed {
  row: SeedExercise;
  upstreamPrimary: readonly string[];
  upstreamSecondary: readonly string[];
}

/**
 * The catalog plus, for every re-tagged strength row, the group tags
 * upstream gave it: a user's copy of a seed row still carrying exactly those
 * is safe to move onto the new tags (seedCatalog's backfill).
 */
export async function fetchCatalogSeedWithOrigins(): Promise<{
  rows: SeedExercise[];
  retagged: RetaggedSeed[];
}> {
  const response = await fetch(DATASET_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch free-exercise-db dataset: ${response.status}`);
  }
  const raw = (await response.json()) as RawExercise[];
  const retagged: RetaggedSeed[] = [];
  // Strength rows get Jim's muscle tree tags (targets.ts), which also
  // re-derive their group tags. Warm-ups and cardio don't count toward
  // volume, so they keep upstream's group tags and no node tags.
  const retag = (row: SeedExercise): SeedExercise => {
    if (row.category !== "strength") return row;
    const tagged = withTargets(row);
    retagged.push({
      row: tagged,
      upstreamPrimary: row.primaryMuscles ?? [],
      upstreamSecondary: row.secondaryMuscles ?? [],
    });
    return tagged;
  };
  const rows = [
    ...raw.map(normalizeExercise).map(retag),
    ...warmupSeedRows(),
    ...curatedSeedRows().map(retag),
    ...cardioSeedRows(),
  ];
  return { rows, retagged };
}

export async function fetchCatalogSeed(): Promise<SeedExercise[]> {
  return (await fetchCatalogSeedWithOrigins()).rows;
}

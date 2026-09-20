import type { exercises } from "../schema";
import { normalizeMuscles } from "./muscles";
import { classifyTrackingType } from "./tracking-type";

const DATASET_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const IMAGE_BASE_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

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

function slugify(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function normalizeExercise(raw: RawExercise): SeedExercise {
  return {
    ownerId: null,
    slug: slugify(raw.id),
    name: raw.name,
    aliases: [],
    primaryMuscles: normalizeMuscles(raw.primaryMuscles),
    secondaryMuscles: normalizeMuscles(raw.secondaryMuscles),
    equipment: raw.equipment,
    mechanic: raw.mechanic as SeedExercise["mechanic"],
    force: raw.force as SeedExercise["force"],
    level: raw.level as SeedExercise["level"],
    trackingType: classifyTrackingType(raw),
    instructions: raw.instructions,
    imageUrls: raw.images.map((path) => `${IMAGE_BASE_URL}/${path}`),
  };
}

export async function fetchCatalogSeed(): Promise<SeedExercise[]> {
  const response = await fetch(DATASET_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch free-exercise-db dataset: ${response.status}`);
  }
  const raw = (await response.json()) as RawExercise[];
  return raw.map(normalizeExercise);
}

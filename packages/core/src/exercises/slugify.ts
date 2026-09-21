/** Shared by the seed script (free-exercise-db ids) and the create-exercise form (names). */
export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

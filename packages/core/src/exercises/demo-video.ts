/**
 * Demo videos (issue #252). An exercise can carry its own `videoUrl` — set
 * on a custom exercise, or on the user's copy of a catalog one — and every
 * other exercise falls back to a YouTube search for its form, so each one
 * has a demo without the catalog having to curate a link per exercise.
 */

/** A pasted link, trimmed; `null` unless it's an http(s) URL. */
export function normalizeVideoUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export interface ExerciseDemo {
  url: string;
  /** True when the exercise has its own link rather than the search fallback. */
  custom: boolean;
}

export function exerciseDemo(exercise: {
  name: string;
  videoUrl?: string | null;
}): ExerciseDemo {
  const custom = exercise.videoUrl ? normalizeVideoUrl(exercise.videoUrl) : null;
  if (custom) return { url: custom, custom: true };
  const query = encodeURIComponent(`${exercise.name} exercise form`);
  return { url: `https://www.youtube.com/results?search_query=${query}`, custom: false };
}

import type { SettingsRow } from "@/lib/db/schema";
import { type StrengthProfile, ageFromBirthdate } from "@jim/core";

/**
 * Adapts the cached settings row into the shape the strength-standards
 * lookup needs. Returns `null` when the profile isn't complete enough to
 * place a lift against a standard (sex and bodyweight are required;
 * birthdate is optional and just skips age adjustment when absent).
 */
export function strengthProfileFromSettings(
  settings: SettingsRow,
  now: Date = new Date(),
): StrengthProfile | null {
  if (!settings.sex || !settings.bodyweight) return null;

  const bodyweight = Number(settings.bodyweight);
  if (!Number.isFinite(bodyweight) || bodyweight <= 0) return null;

  return {
    sex: settings.sex,
    bodyweight,
    age: settings.birthdate ? ageFromBirthdate(settings.birthdate, now) : null,
  };
}

/**
 * `profile` judged at `date`: the bodyweight that applied then, from the
 * weigh-in history (issue #249), in place of today's. Keeps today's when
 * there's no weigh-in to go on.
 */
export function strengthProfileOn(
  profile: StrengthProfile,
  bodyweightAt: (date: Date) => number | null,
  date: Date,
): StrengthProfile {
  const then = bodyweightAt(date);
  return then != null && then > 0 ? { ...profile, bodyweight: then } : profile;
}

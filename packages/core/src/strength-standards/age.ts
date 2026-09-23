/**
 * Whole years elapsed since `birthdateIso` (an ISO "YYYY-MM-DD" date, as
 * stored in the `users.birthdate` column) as of `asOf`. Pure so it can be
 * tested without mocking the clock; callers pass `new Date()` for "today".
 */
export function ageFromBirthdate(birthdateIso: string, asOf: Date): number {
  const birthdate = new Date(`${birthdateIso}T00:00:00Z`);
  let age = asOf.getUTCFullYear() - birthdate.getUTCFullYear();

  const hasHadBirthdayThisYear =
    asOf.getUTCMonth() > birthdate.getUTCMonth() ||
    (asOf.getUTCMonth() === birthdate.getUTCMonth() && asOf.getUTCDate() >= birthdate.getUTCDate());
  if (!hasHadBirthdayThisYear) age -= 1;

  return age;
}

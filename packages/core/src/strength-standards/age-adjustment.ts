/**
 * Strength standards are normally quoted for a lifter in their physical
 * prime; outside that window, raw strength trends down. This applies a
 * simple, documented approximation — a flat 1% reduction per year outside
 * 18–40, floored so it never zeroes out a standard — rather than reproducing
 * any specific published age-coefficient curve (e.g. IPF/Wilks-style tables),
 * which vary lift to lift and federation to federation.
 */
const PRIME_AGE_START = 18;
const PRIME_AGE_END = 40;
const PER_YEAR_ADJUSTMENT = 0.01;
const MIN_FACTOR = 0.5;

export function ageAdjustmentFactor(age: number | null | undefined): number {
  if (age == null || !Number.isFinite(age) || age <= 0) return 1;

  const yearsOutsidePrime =
    age < PRIME_AGE_START ? PRIME_AGE_START - age : age > PRIME_AGE_END ? age - PRIME_AGE_END : 0;

  if (yearsOutsidePrime === 0) return 1;
  return Math.max(MIN_FACTOR, 1 - yearsOutsidePrime * PER_YEAR_ADJUSTMENT);
}

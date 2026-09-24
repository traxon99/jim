const CM_PER_INCH = 2.54;
const INCHES_PER_FOOT = 12;

/**
 * Height is stored in centimetres (`users.height_cm`) but entered and shown
 * in feet and inches. Rounds to the nearest whole inch, carrying 12" up into
 * the next foot so 5'11.8" reads as 6'0" rather than 5'12".
 */
export function cmToFeetInches(cm: string | number | null | undefined): {
  feet: number;
  inches: number;
} | null {
  if (cm == null || cm === "") return null;
  const n = Number(cm);
  if (!Number.isFinite(n) || n <= 0) return null;
  const totalInches = Math.round(n / CM_PER_INCH);
  return {
    feet: Math.floor(totalInches / INCHES_PER_FOOT),
    inches: totalInches % INCHES_PER_FOOT,
  };
}

/** Returns centimetres rounded to one decimal, or null if the input isn't a positive height. */
export function feetInchesToCm(feet: number, inches: number): number | null {
  if (!Number.isFinite(feet) || !Number.isFinite(inches) || feet < 0 || inches < 0) return null;
  const totalInches = feet * INCHES_PER_FOOT + inches;
  if (totalInches <= 0) return null;
  return Math.round(totalInches * CM_PER_INCH * 10) / 10;
}

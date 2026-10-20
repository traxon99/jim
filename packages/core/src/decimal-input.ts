/**
 * Normalizes what's typed into a decimal field as it's typed. In regions
 * that write a decimal comma, iOS's decimal keypad shows "," and a
 * `type="number"` input threw "62,5" away (#675). Decimal fields are
 * `type="text"` instead, and this turns the comma into the "." every parser
 * here expects, so "62,5" is stored as 62.5.
 */
export function normalizeDecimalInput(typed: string): string {
  return typed.replace(/,/g, ".");
}

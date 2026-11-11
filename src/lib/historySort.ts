/**
 * Comparator for history columns that may be unreported (null). Nulls are
 * not zero: they always sort last, in BOTH directions, so an unknown value
 * never pretends to be the smallest measurement.
 */
export function compareNullableNumber(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1

  return (a - b) * dir
}

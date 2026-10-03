/** Small numeric helpers shared by the checks. Empty input gives NaN, so a missing measurement can't pass as zero. */

export function mean(values: readonly number[]): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : NaN;
}

export function stdDev(values: readonly number[]): number {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

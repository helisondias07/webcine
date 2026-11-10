/**
 * Room playback leader from peer timestamps.
 * Empty or non-finite maps must not become -Infinity (Math.max of []) or 0
 * (median of []), which would seek late joiners to the start.
 */
export function finiteTimestamps(tsMap: Record<string, number>): number[] {
  return Object.values(tsMap).filter((value) => Number.isFinite(value));
}

export function calculateMedian(values: number[]): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function leaderTimeFromMap(
  tsMap: Record<string, number>,
  participantCount: number,
): number {
  const times = finiteTimestamps(tsMap);
  if (times.length === 0) {
    return Number.NaN;
  }
  if (participantCount > 2) {
    return calculateMedian(times);
  }
  return Math.max(...times);
}

import type { HistoryBucket, RoomEvent, Stamp } from '@comet/shared';

export function selectPeaks(buckets: HistoryBucket[]): HistoryBucket[] {
  const peaks: HistoryBucket[] = [];
  for (const candidate of [...buckets].sort((a, b) => b.totalCount - a.totalCount || a.start - b.start)) {
    if (peaks.every((peak) => Math.abs(peak.start - candidate.start) >= 3 * 60_000)) {
      peaks.push(candidate);
      if (peaks.length === 10) break;
    }
  }
  return peaks;
}

export function summarizeMetrics(events: RoomEvent[], from: number, to: number, minuteBuckets: HistoryBucket[], peaks: HistoryBucket[]) {
  const stampCounts = new Map<string, { stamp: Stamp; count: number }>();
  for (const event of events) if (event.type === 'stamp') {
    const key = event.stamp.stamp.id || event.stamp.stamp.name;
    const current = stampCounts.get(key);
    stampCounts.set(key, { stamp: event.stamp.stamp, count: (current?.count ?? 0) + 1 });
  }
  const comments = events.filter((event) => event.type === 'comment').length;
  return { durationMs: Math.max(0, to - from), maxPostsPerMinute: minuteBuckets.reduce((max, bucket) => Math.max(max, bucket.totalCount), 0), peakAt: peaks[0]?.start ?? null, topStamp: [...stampCounts.values()].sort((a, b) => b.count - a.count)[0] ?? null, commentRatio: events.length ? comments / events.length : 0 };
}

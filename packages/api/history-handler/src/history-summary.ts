import type {
  HistoryBucket,
  PopularHistoryItem,
  RoomEvent,
  Stamp,
} from '@comet/shared';

export function bucketSizeFor(duration: number): number {
  if (duration <= 30 * 60_000) return 10_000;
  if (duration <= 90 * 60_000) return 30_000;
  if (duration <= 3 * 60 * 60_000) return 60_000;
  return 5 * 60_000;
}

export function aggregateEvents(
  events: RoomEvent[],
  from: number,
  to: number,
  bucketSizeMs: number
): HistoryBucket[] {
  const buckets = new Map<number, RoomEvent[]>();
  for (const event of events) {
    const start = from + Math.floor((event.timestamp - from) / bucketSizeMs) * bucketSizeMs;
    const values = buckets.get(start) ?? [];
    values.push(event);
    buckets.set(start, values);
  }

  const result: HistoryBucket[] = [];
  for (let start = from; start <= to; start += bucketSizeMs) {
    const values = buckets.get(start) ?? [];
    const comments = values.filter((event) => event.type === 'comment');
    const stamps = values.filter((event) => event.type === 'stamp');
    const stampCounts = new Map<string, { stamp: Stamp; count: number }>();
    const itemCounts = new Map<string, PopularHistoryItem>();
    for (const event of comments) {
      if (event.type !== 'comment') continue;
      const key = `comment:${event.comment.content}`;
      const current = itemCounts.get(key);
      itemCounts.set(key, {
        type: 'comment',
        content: event.comment.content,
        count: (current?.count ?? 0) + 1,
      });
    }
    for (const event of stamps) {
      if (event.type !== 'stamp') continue;
      const key = event.stamp.stamp.id || event.stamp.stamp.name;
      const current = stampCounts.get(key);
      stampCounts.set(key, {
        stamp: event.stamp.stamp,
        count: (current?.count ?? 0) + 1,
      });
      const itemKey = `stamp:${key}`;
      const item = itemCounts.get(itemKey);
      itemCounts.set(itemKey, {
        type: 'stamp',
        stamp: event.stamp.stamp,
        count: (item?.count ?? 0) + 1,
      });
    }
    result.push({
      start,
      end: Math.min(start + bucketSizeMs, to),
      totalCount: values.length,
      commentCount: comments.length,
      stampCount: stamps.length,
      popularStamps: [...stampCounts.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
      popularItems: [...itemCounts.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
      sampleComments: comments
        .slice(-5)
        .map((event) => event.type === 'comment' ? event.comment : neverValue()),
    });
  }
  return result;
}

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

function neverValue(): never {
  throw new Error('unexpected event type');
}

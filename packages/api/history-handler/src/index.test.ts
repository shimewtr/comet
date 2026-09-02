import { describe, expect, it } from 'vitest';
import type { RoomEvent } from '@comet/shared';
import { aggregateEvents, bucketSizeFor } from './history-summary';

describe('bucketSizeFor', () => {
  it.each([
    [30 * 60_000, 10_000],
    [30 * 60_000 + 1, 30_000],
    [90 * 60_000, 30_000],
    [90 * 60_000 + 1, 60_000],
    [3 * 60 * 60_000, 60_000],
    [3 * 60 * 60_000 + 1, 300_000],
  ])('%i ms returns %i ms buckets', (duration, expected) => {
    expect(bucketSizeFor(duration)).toBe(expected);
  });
});

describe('aggregateEvents', () => {
  it('counts comments and stamps and provides hover summaries', () => {
    const events: RoomEvent[] = [
      {
        type: 'comment',
        timestamp: 1_001,
        comment: { id: 'c1', content: 'hello', timestamp: 1_001, style: { color: '#fff', size: 'medium' } },
      },
      {
        type: 'stamp',
        timestamp: 1_002,
        stamp: { id: 's1', timestamp: 1_002, stamp: { id: 'like', name: '👍', imageUrl: '', category: 'reaction' } },
      },
    ];
    const [bucket] = aggregateEvents(events, 1_000, 2_000, 1_000);
    expect(bucket).toMatchObject({ totalCount: 2, commentCount: 1, stampCount: 1 });
    expect(bucket.sampleComments[0].content).toBe('hello');
    expect(bucket.popularStamps[0].count).toBe(1);
    expect(bucket.popularItems).toEqual([
      { type: 'comment', content: 'hello', count: 1 },
      { type: 'stamp', stamp: { id: 'like', name: '👍', imageUrl: '', category: 'reaction' }, count: 1 },
    ]);
  });
});

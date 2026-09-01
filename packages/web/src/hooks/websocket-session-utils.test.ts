import { describe, expect, it } from 'vitest';
import type { Comment } from '@comet/shared';
import { MAX_COMMENT_HISTORY, mergeCommentHistory } from './websocket-session-utils';

function comment(id: string, timestamp: number): Comment {
  return {
    id,
    content: id,
    timestamp,
    style: { color: '#fff', size: 'medium' },
  };
}

describe('mergeCommentHistory', () => {
  it('deduplicates by comment ID, keeps descending order, and limits the result', () => {
    const previous = Array.from({ length: MAX_COMMENT_HISTORY }, (_, index) =>
      comment(`previous-${index}`, index)
    );
    const result = mergeCommentHistory(previous, [
      comment('previous-0', 1_000),
      comment('new', 999),
    ]);

    expect(result).toHaveLength(MAX_COMMENT_HISTORY);
    expect(result.slice(0, 2).map(({ id }) => id)).toEqual(['previous-0', 'new']);
    expect(result.filter(({ id }) => id === 'previous-0')).toHaveLength(1);
  });
});

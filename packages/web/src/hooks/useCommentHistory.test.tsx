import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WebSocketMessageType, type Comment } from '@comet/shared';
import { useCommentHistory } from './useCommentHistory';

function comment(id: string, timestamp: number): Comment {
  return {
    id,
    content: id,
    timestamp,
    style: { color: '#fff', size: 'medium' },
  };
}

describe('useCommentHistory', () => {
  it('keeps comments for the joined Room and clears them on demand', () => {
    const roomIdRef = { current: 'room-1' };
    const { result } = renderHook(() => useCommentHistory(roomIdRef));

    act(() => {
      result.current.handleNewComment(
        { comment: comment('ignored', 1) },
        {
          type: WebSocketMessageType.NEW_COMMENT,
          payload: { comment: comment('ignored', 1) },
          roomId: 'room-2',
        }
      );
      result.current.handleNewComment(
        { comment: comment('accepted', 2) },
        {
          type: WebSocketMessageType.NEW_COMMENT,
          payload: { comment: comment('accepted', 2) },
          roomId: 'room-1',
        }
      );
    });

    expect(result.current.commentHistory.map(({ id }) => id)).toEqual(['accepted']);

    act(() => result.current.clearCommentHistory());
    expect(result.current.commentHistory).toEqual([]);
  });

  it('merges a Room history response in timestamp order', () => {
    const roomIdRef = { current: 'room-1' };
    const { result } = renderHook(() => useCommentHistory(roomIdRef));

    act(() => {
      result.current.handleHistory(
        { comments: [comment('older', 1), comment('newer', 3)] },
        {
          type: WebSocketMessageType.HISTORY,
          payload: { comments: [comment('older', 1), comment('newer', 3)] },
          roomId: 'room-1',
        }
      );
    });

    expect(result.current.commentHistory.map(({ id }) => id)).toEqual(['newer', 'older']);
  });
});

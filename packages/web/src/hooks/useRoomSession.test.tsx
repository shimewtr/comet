import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WebSocketMessageType } from '@comet/shared';
import { useRoomSession } from './useRoomSession';

describe('useRoomSession', () => {
  it('clears history and sends JOIN_ROOM while the selected Room is joining', async () => {
    const sendWhenOpen = vi.fn().mockResolvedValue(true);
    const clearCommentHistory = vi.fn();
    const { result } = renderHook(() =>
      useRoomSession({
        socketRef: { current: { sendWhenOpen } } as never,
        joinedRoomIdRef: { current: null },
        clearCommentHistory,
        setError: vi.fn(),
      })
    );
    await act(async () => {
      await expect(result.current.joinRoom('room-2')).resolves.toBe(true);
    });
    expect(result.current.isJoiningRoom).toBe(true);
    expect(clearCommentHistory).toHaveBeenCalledOnce();
    expect(sendWhenOpen).toHaveBeenCalledWith(WebSocketMessageType.JOIN_ROOM, {
      roomId: 'room-2',
    });
  });
});

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

  it('recovers to the fallback Room while preserving a Room error', () => {
    const send = vi.fn();
    const clearCommentHistory = vi.fn();
    const setError = vi.fn();
    const fallbackRoom = {
      id: 'global',
      name: 'グローバル',
      createdAt: 0,
      lastActiveAt: 0,
      expiresAt: null,
    };
    const { result } = renderHook(() =>
      useRoomSession({
        socketRef: { current: { send } } as never,
        joinedRoomIdRef: { current: 'expired-room' },
        clearCommentHistory,
        setError,
      })
    );

    act(() => {
      result.current.handleRoomError({
        code: 'ROOM_EXPIRED',
        message: 'このRoomは期限切れです',
        fallbackRoom,
      });
    });

    expect(result.current.currentRoom).toEqual(fallbackRoom);
    expect(result.current.isJoiningRoom).toBe(false);
    expect(clearCommentHistory).toHaveBeenCalledOnce();
    expect(setError).toHaveBeenCalledWith('このRoomは期限切れです');
    expect(setError).not.toHaveBeenCalledWith(null);
    expect(send).toHaveBeenCalledWith(WebSocketMessageType.HISTORY_REQUEST, {});
  });
});

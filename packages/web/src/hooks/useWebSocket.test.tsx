import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketMessageType, type Stamp } from '@comet/shared';

const mocks = vi.hoisted(() => ({
  sendWhenOpen: vi.fn(),
  isJoiningRoom: false,
}));

vi.mock('./useCommentHistory', () => ({
  useCommentHistory: () => ({
    commentHistory: [],
    clearCommentHistory: vi.fn(),
    handleNewComment: vi.fn(),
    handleHistory: vi.fn(),
  }),
}));

vi.mock('./useRoomSession', () => ({
  useRoomSession: () => ({
    isJoiningRoom: mocks.isJoiningRoom,
    rooms: [],
    currentRoom: { id: 'global', name: 'グローバル' },
    setRooms: vi.fn(),
    handleRoomCreated: vi.fn(),
    acceptRoom: vi.fn(),
    handleRoomError: vi.fn(),
    joinRoom: vi.fn(),
    createRoom: vi.fn(),
    refreshRooms: vi.fn(),
  }),
}));

vi.mock('./useWebSocketConnection', () => ({
  useWebSocketConnection: ({ socketRef }: { socketRef: { current: unknown } }) => {
    socketRef.current = { sendWhenOpen: mocks.sendWhenOpen };
    return { isConnected: true };
  },
}));

import { useWebSocket } from './useWebSocket';

const stamp: Stamp = {
  id: 'like',
  name: '👍',
  imageUrl: '',
  category: 'reaction',
};

describe('useWebSocket', () => {
  beforeEach(() => {
    mocks.isJoiningRoom = false;
    mocks.sendWhenOpen.mockReset();
    mocks.sendWhenOpen.mockResolvedValue(true);
  });

  it('sends comments and stamps once the Room has been joined', async () => {
    const { result } = renderHook(() => useWebSocket());

    await expect(
      result.current.sendComment({
        content: 'hello',
        style: { color: '#fff', size: 'medium' },
      })
    ).resolves.toBe(true);
    await expect(result.current.sendStamp(stamp, { x: 0.25, y: 0.5 })).resolves.toBe(true);

    expect(mocks.sendWhenOpen).toHaveBeenNthCalledWith(
      1,
      WebSocketMessageType.NEW_COMMENT,
      {
        comment: expect.objectContaining({
          content: 'hello',
          style: { color: '#fff', size: 'medium' },
          id: expect.any(String),
          timestamp: expect.any(Number),
        }),
      }
    );
    expect(mocks.sendWhenOpen).toHaveBeenNthCalledWith(
      2,
      WebSocketMessageType.NEW_STAMP,
      {
        stamp: expect.objectContaining({
          stamp,
          position: { x: 0.25, y: 0.5 },
          id: expect.any(String),
          timestamp: expect.any(Number),
        }),
      }
    );
  });

  it('does not send messages while a Room is joining', async () => {
    mocks.isJoiningRoom = true;
    const { result } = renderHook(() => useWebSocket());

    await expect(
      result.current.sendComment({
        content: 'hello',
        style: { color: '#fff', size: 'medium' },
      })
    ).resolves.toBe(false);
    await expect(result.current.sendStamp(stamp)).resolves.toBe(false);

    expect(mocks.sendWhenOpen).not.toHaveBeenCalled();
  });
});

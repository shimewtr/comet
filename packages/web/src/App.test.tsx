import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  socket: {
    isConnected: false,
    isJoiningRoom: false,
  },
}));

vi.mock('./hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    ...mocks.socket,
    error: null,
    commentHistory: [],
    sendComment: vi.fn(),
    sendStamp: vi.fn(),
    reconnect: vi.fn(),
    rooms: [{ id: 'global', name: 'グローバル', createdAt: 0, lastActiveAt: 0, expiresAt: null }],
    currentRoom: { id: 'global', name: 'グローバル', createdAt: 0, lastActiveAt: 0, expiresAt: null },
    joinRoom: vi.fn(),
    createRoom: vi.fn(),
    refreshRooms: vi.fn(),
  }),
}));

vi.mock('./components/StampPicker', () => ({
  StampPicker: ({ disabled }: { disabled: boolean }) => (
    <button type="button" disabled={disabled}>スタンプ</button>
  ),
}));

import App from './App';

describe('App live screen', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.socket.isConnected = false;
    mocks.socket.isJoiningRoom = false;
  });

  it('disables Room and posting controls until connected', () => {
    render(<App />);

    expect(screen.getByLabelText('参加中のRoom')).toHaveProperty('disabled', true);
    expect(screen.getByPlaceholderText('コメントを入力...')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: '作成' })).toHaveProperty('disabled', true);
  });

  it('keeps posting controls disabled while joining a Room', () => {
    mocks.socket.isConnected = true;
    mocks.socket.isJoiningRoom = true;
    render(<App />);

    expect(screen.getByLabelText('参加中のRoom')).toHaveProperty('disabled', true);
    expect(screen.getByPlaceholderText('コメントを入力...')).toHaveProperty('disabled', true);
  });
});

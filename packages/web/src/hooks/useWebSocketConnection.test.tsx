import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadRuntimeConfig: vi.fn(),
  getAuthToken: vi.fn(),
  getOrCreateParticipantId: vi.fn(),
  socketInstances: [] as unknown[],
}));

vi.mock('../auth', () => ({
  loadRuntimeConfig: mocks.loadRuntimeConfig,
  getAuthToken: mocks.getAuthToken,
}));

vi.mock('../participant-id', () => ({
  getOrCreateParticipantId: mocks.getOrCreateParticipantId,
}));

vi.mock('@comet/shared', () => ({
  CometSocket: class MockCometSocket {
    readonly connect = vi.fn().mockResolvedValue(undefined);
    readonly disconnect = vi.fn();
    readonly url: string;
    readonly options: {
      onStatusChange: (status: 'open' | 'failed') => void;
    };

    constructor(
      url: string,
      options: {
        onStatusChange: (status: 'open' | 'failed') => void;
      }
    ) {
      this.url = url;
      this.options = options;
      mocks.socketInstances.push(this);
    }
  },
}));

import { useWebSocketConnection } from './useWebSocketConnection';

interface MockSocket {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  options: { onStatusChange: (status: 'open' | 'failed') => void };
}

describe('useWebSocketConnection', () => {
  beforeEach(() => {
    mocks.loadRuntimeConfig.mockReset();
    mocks.getAuthToken.mockReset();
    mocks.getOrCreateParticipantId.mockReset();
    mocks.socketInstances.length = 0;
    mocks.getOrCreateParticipantId.mockReturnValue('participant-1');
  });

  it('reports a missing WebSocket URL without creating a socket', async () => {
    const setError = vi.fn();
    mocks.loadRuntimeConfig.mockResolvedValue({ websocketUrl: '' });

    renderHook(() =>
      useWebSocketConnection({
        socketRef: { current: null },
        setError,
        onOpen: vi.fn(),
        onFailed: vi.fn(),
        subscribe: vi.fn(() => []),
      })
    );

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('WebSocket URL is not configured');
    });
    expect(mocks.socketInstances).toHaveLength(0);
  });

  it('reflects connection status and delegates open and failed callbacks', async () => {
    const onOpen = vi.fn();
    const onFailed = vi.fn();
    const subscribe = vi.fn(() => [vi.fn()]);
    mocks.loadRuntimeConfig.mockResolvedValue({ websocketUrl: 'wss://example.test' });

    const { result } = renderHook(() =>
      useWebSocketConnection({
        socketRef: { current: null } as never,
        setError: vi.fn(),
        onOpen,
        onFailed,
        subscribe,
      })
    );

    await waitFor(() => expect(mocks.socketInstances).toHaveLength(1));
    const socket = mocks.socketInstances[0] as MockSocket;
    expect(socket.connect).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledOnce();

    act(() => socket.options.onStatusChange('open'));
    expect(result.current.isConnected).toBe(true);
    expect(onOpen).toHaveBeenCalledOnce();

    act(() => socket.options.onStatusChange('failed'));
    expect(result.current.isConnected).toBe(false);
    expect(onFailed).toHaveBeenCalledOnce();
  });
});

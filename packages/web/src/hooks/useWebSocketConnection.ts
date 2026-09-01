import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { CometSocket, type CometSocketStatus } from '@comet/shared';
import { getAuthToken, loadRuntimeConfig } from '../auth';
import { getOrCreateParticipantId } from '../participant-id';

interface UseWebSocketConnectionOptions {
  socketRef: MutableRefObject<CometSocket | null>;
  setError: (error: string | null) => void;
  onOpen: () => void;
  onFailed: () => void;
  subscribe: (socket: CometSocket) => Array<() => void>;
}

interface UseWebSocketConnectionResult {
  isConnected: boolean;
}

export function useWebSocketConnection({
  socketRef,
  setError,
  onOpen,
  onFailed,
  subscribe,
}: UseWebSocketConnectionOptions): UseWebSocketConnectionResult {
  const [websocketUrl, setWebsocketUrl] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const participantIdRef = useRef(getOrCreateParticipantId());
  const callbacksRef = useRef({ onOpen, onFailed, subscribe });
  callbacksRef.current = { onOpen, onFailed, subscribe };

  useEffect(() => {
    let active = true;
    loadRuntimeConfig().then((config) => {
      if (active) {
        setWebsocketUrl(
          config.websocketUrl || import.meta.env.VITE_WEBSOCKET_URL || ''
        );
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (websocketUrl === null) return;
    if (!websocketUrl) {
      setError('WebSocket URL is not configured');
      return;
    }

    const handleStatusChange = (status: CometSocketStatus) => {
      setIsConnected(status === 'open');
      if (status === 'open') callbacksRef.current.onOpen();
      else if (status === 'failed') callbacksRef.current.onFailed();
    };
    const socket = new CometSocket(websocketUrl, {
      tokenProvider: getAuthToken,
      participantId: participantIdRef.current,
      onStatusChange: handleStatusChange,
    });
    const unsubscribers = callbacksRef.current.subscribe(socket);
    socketRef.current = socket;
    socket.connect().catch((error: unknown) => {
      console.error('Failed to connect WebSocket:', error);
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      socket.disconnect();
      socketRef.current = null;
    };
  }, [setError, socketRef, websocketUrl]);

  return { isConnected };
}

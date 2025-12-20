import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  WebSocketMessage,
  NewCommentPayload,
  NewStampPayload,
  Comment,
  Stamp,
  StampMessage,
} from '@comet/shared';
import { WebSocketMessageType } from '@comet/shared';

const WEBSOCKET_URL = import.meta.env.VITE_WEBSOCKET_URL;
const RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_COMMENT_HISTORY = 100;
const HEARTBEAT_INTERVAL = 5000; // 5秒ごとにheartbeat

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentHistory, setCommentHistory] = useState<Comment[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const heartbeatTimeoutRef = useRef<number | null>(null);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    clearHeartbeat();

    // 定期的に接続状態をチェック
    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        console.log('Connection lost - WebSocket is not open');
        setIsConnected(false);
        clearHeartbeat();
      }
    }, HEARTBEAT_INTERVAL);
  }, [clearHeartbeat]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(WEBSOCKET_URL);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        startHeartbeat();
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        wsRef.current = null;
        clearHeartbeat();

        // 再接続を試みる
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++;
          console.log(
            `Reconnecting... (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`
          );
          reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_INTERVAL);
        } else {
          setError('Failed to connect after multiple attempts');
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('WebSocket connection error');
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          // コメント受信時に履歴に追加
          if (message.type === WebSocketMessageType.NEW_COMMENT) {
            const payload = message.payload as NewCommentPayload;
            setCommentHistory((prev) => {
              const newHistory = [payload.comment, ...prev];
              // コメント内容で重複を除去しつつ最大数まで保持
              const distinctHistory = Array.from(
                new Map(newHistory.map((c) => [c.content, c])).values()
              );
              return distinctHistory.slice(0, MAX_COMMENT_HISTORY);
            });
          }
        } catch (err) {
          console.error('Failed to parse message:', err);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError('Failed to create WebSocket connection');
    }
  }, [startHeartbeat, clearHeartbeat]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    clearHeartbeat();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
  }, [clearHeartbeat]);

  const sendComment = useCallback(
    async (comment: Omit<Comment, 'id' | 'timestamp'>) => {
      // WebSocketが接続中の場合は接続完了を待つ（最大3秒）
      if (wsRef.current?.readyState === WebSocket.CONNECTING) {
        const timeout = 3000;
        const startTime = Date.now();

        await new Promise<void>((resolve) => {
          const checkConnection = () => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              resolve();
            } else if (
              wsRef.current?.readyState === WebSocket.CONNECTING &&
              Date.now() - startTime < timeout
            ) {
              setTimeout(checkConnection, 50);
            } else {
              resolve(); // タイムアウトまたは接続失敗時も resolve
            }
          };
          checkConnection();
        });
      }

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.error('WebSocket is not connected');
        return false;
      }

      const fullComment: Comment = {
        ...comment,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
      };

      const message: WebSocketMessage<NewCommentPayload> = {
        type: WebSocketMessageType.NEW_COMMENT,
        payload: { comment: fullComment },
        timestamp: Date.now(),
      };

      try {
        wsRef.current.send(JSON.stringify(message));
        return true;
      } catch (err) {
        console.error('Failed to send comment:', err);
        return false;
      }
    },
    []
  );

  const sendStamp = useCallback(
    async (stamp: Stamp, position?: { x: number; y: number }) => {
      // WebSocketが接続中の場合は接続完了を待つ（最大3秒）
      if (wsRef.current?.readyState === WebSocket.CONNECTING) {
        const timeout = 3000;
        const startTime = Date.now();

        await new Promise<void>((resolve) => {
          const checkConnection = () => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              resolve();
            } else if (
              wsRef.current?.readyState === WebSocket.CONNECTING &&
              Date.now() - startTime < timeout
            ) {
              setTimeout(checkConnection, 50);
            } else {
              resolve(); // タイムアウトまたは接続失敗時も resolve
            }
          };
          checkConnection();
        });
      }

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.error('WebSocket is not connected');
        return false;
      }

      const stampMessage: StampMessage = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        stamp,
        timestamp: Date.now(),
        position,
      };

      const message: WebSocketMessage<NewStampPayload> = {
        type: WebSocketMessageType.NEW_STAMP,
        payload: { stamp: stampMessage },
        timestamp: Date.now(),
      };

      try {
        wsRef.current.send(JSON.stringify(message));
        return true;
      } catch (err) {
        console.error('Failed to send stamp:', err);
        return false;
      }
    },
    []
  );

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    error,
    commentHistory,
    sendComment,
    sendStamp,
    reconnect: connect,
  };
}

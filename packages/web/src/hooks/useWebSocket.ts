import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  NewCommentPayload,
  NewStampPayload,
  HistoryPayload,
  Comment,
  Stamp,
  StampMessage,
} from '@comet/shared';
import { WebSocketMessageType, CometSocket, generateId } from '@comet/shared';

const WEBSOCKET_URL = import.meta.env.VITE_WEBSOCKET_URL;
const MAX_COMMENT_HISTORY = 100;

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentHistory, setCommentHistory] = useState<Comment[]>([]);
  const socketRef = useRef<CometSocket | null>(null);

  useEffect(() => {
    if (!WEBSOCKET_URL) {
      console.error('VITE_WEBSOCKET_URL is not set');
      setError('WebSocket URL is not configured');
      return;
    }

    const socket = new CometSocket(WEBSOCKET_URL, {
      onStatusChange: (status) => {
        setIsConnected(status === 'open');

        if (status === 'open') {
          setError(null);
          // 接続（再接続含む）のたびに直近のコメント履歴を取得する
          socket.send(WebSocketMessageType.HISTORY_REQUEST, {});
        } else if (status === 'failed') {
          setError('Failed to connect after multiple attempts');
        }
      },
    });

    // 新しい順（先頭が最新）でIDの重複を除去しつつ最大数まで保持する
    const mergeIntoHistory = (prev: Comment[], incoming: Comment[]) => {
      const merged = [...prev, ...incoming].sort(
        (a, b) => b.timestamp - a.timestamp
      );
      const distinctHistory = Array.from(
        new Map(merged.map((c) => [c.id, c])).values()
      );
      return distinctHistory.slice(0, MAX_COMMENT_HISTORY);
    };

    const unsubscribeComment = socket.on<NewCommentPayload>(
      WebSocketMessageType.NEW_COMMENT,
      (payload) => {
        setCommentHistory((prev) => mergeIntoHistory(prev, [payload.comment]));
      }
    );

    const unsubscribeHistory = socket.on<HistoryPayload>(
      WebSocketMessageType.HISTORY,
      (payload) => {
        setCommentHistory((prev) => mergeIntoHistory(prev, payload.comments));
      }
    );

    socket.connect().catch((err) => {
      // 初回接続失敗でもCometSocketが自動で再接続を試みる
      console.error('Failed to connect WebSocket:', err);
    });
    socketRef.current = socket;

    return () => {
      unsubscribeComment();
      unsubscribeHistory();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const sendComment = useCallback(
    async (comment: Omit<Comment, 'id' | 'timestamp'>) => {
      const socket = socketRef.current;
      if (!socket) {
        return false;
      }

      const fullComment: Comment = {
        ...comment,
        id: generateId(),
        timestamp: Date.now(),
      };

      const payload: NewCommentPayload = { comment: fullComment };
      const sent = await socket.sendWhenOpen(
        WebSocketMessageType.NEW_COMMENT,
        payload
      );

      if (!sent) {
        console.error('WebSocket is not connected');
      }
      return sent;
    },
    []
  );

  const sendStamp = useCallback(
    async (stamp: Stamp, position?: { x: number; y: number }) => {
      const socket = socketRef.current;
      if (!socket) {
        return false;
      }

      const stampMessage: StampMessage = {
        id: generateId(),
        stamp,
        timestamp: Date.now(),
        position,
      };

      const payload: NewStampPayload = { stamp: stampMessage };
      const sent = await socket.sendWhenOpen(
        WebSocketMessageType.NEW_STAMP,
        payload
      );

      if (!sent) {
        console.error('WebSocket is not connected');
      }
      return sent;
    },
    []
  );

  const reconnect = useCallback(() => {
    socketRef.current?.reconnectNow();
  }, []);

  return {
    isConnected,
    error,
    commentHistory,
    sendComment,
    sendStamp,
    reconnect,
  };
}
